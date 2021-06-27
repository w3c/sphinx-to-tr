#!/usr/bin/env node

const Fs = require('fs')
const Path = require('path')
const jsdom = require("jsdom")
const { JSDOM } = jsdom
const PROTOCOL = 'http:'
const HOST = 'www.w3.org'
const PORT = 80
const WEBROOT = '/TR/'
const WAITFOR = [] // ['$']

// Working class to translate Sphinx docs to W3C TR/ format
class SphinxToTr {
  constructor (path, appendixLabels) {
    const parsed = Path.parse(path)
    this.relDir = parsed.dir
    this.startPage = parsed.name + parsed.ext
    this.appendixLabels = appendixLabels
    this.visited = new Set()
  }

  async index (leader = '', page = this.startPage) {
    try {
      const { dom, document, url } = await this.loadPage(page, 1000)
      const dir = url.href.substr(0, url.href.length - page.length) // new URL('..', url).href
      WAITFOR.forEach( (wf) => {
        if (!(wf in dom.window))
          throw new Error(`${wf} failed to load`)
      })
      this.visited.add(page)
      const find =
            // (selectors, from) => (from ? dom.window.$(from).find(selectors) : dom.window.$(selectors)).get() // jQuery
            (selectors, from) => [...(from || document).querySelectorAll(selectors)] // DOM
      const urlStrToElements =
            SphinxToTr.localHrefs(find('a'), dir)
            .reduce( (acc, [urlStr, elt]) => acc.set(urlStr, elt), new ArrayMap())
      urlStrToElements.delete('')
      console.log(`${page} has ${urlStrToElements.total} references to ${urlStrToElements.size} descendants of ${dir}`)
      const [primaryToc, indexes, downloads] = find('[role=navigation] > div > ul') // sphinx seems to have three unclassed <ul/>s
      const numberedSections = find(':scope > li', primaryToc)
            .filter( (elt) => this.appendixLabels.indexOf(elt.textContent) === -1 )

      // add section numbers to DOM
      const queue = numberedSections.map((li, idx) => {
        const secNo = leader + (idx + 1)
        const az = SphinxToTr.localHrefs(find(':scope > a', li), dir)
        if (az.length !== 1)
          throw new Error(`found ${az.length} a elements in TOC entry ${li.outerHTML}`)
        const [relUrl, a] = az[0] // assume there's only one <a/> in the <li/>
        const linkText = a.textContent

        a.textContent = ''
        a.appendChild(SphinxToTr.span(document, secNo, ['secno']))
        a.appendChild(document.createTextNode(' '))
        a.appendChild(SphinxToTr.span(document, linkText, ['content']))

        // console.log(relUrl, a.outerHTML)
        return {relUrl, secNo}
      })
      console.log(numberedSections.map(elt => elt.outerHTML))
      // document.documentElement.outerHTML
      return await Promise.all(queue.map(
        ({relUrl, secNo}) => this.visited.has(relUrl) ?
          ['recursion'] :
          this.index(secNo + '.', relUrl)
      ))
    } catch (e) {
      console.warn('caught:', e)
    }
  }

  static span (document, text, classes) {
    const span = document.createElement('span')
    span.textContent = text
    classes.forEach( (c) => span.classList.add(c) )
    return span
  }

  static localHrefs (elts, dir) {
    return elts
      .map( (elt) => [SphinxToTr.noHash(elt), elt] )
      .filter( ([urlStr, elt]) => [urlStr.startsWith(dir), elt] )
      .map( ([urlStr, elt]) => [urlStr.substr(dir.length), elt] )
  }

  async loadPage (page, timeout) {
    const path = Path.join(__dirname, this.relDir, page) // paths relative to repo root
    let url = new URL('file://' + path)
    let dom = getDom(page)
    // dom.window.navigator.appVersion = dom.window.navigator.userAgent
    let timer = null;
    await Promise.race([
      new Promise((res, rej) => {
        timer = setTimeout(() => {
          timer = null
          rej(`timeout of ${timeout} exceeded when fetching ${page}`)
        }, timeout)
      }),
      new Promise((res, rej) => {
        dom.window.document.addEventListener("DOMContentLoaded", (evt) => {
          if (timer) {
            clearTimeout(timer)
            res()
          } else {
            rej('timeout')
          }
        })
      })
    ])
    return { dom, path, url, document: dom.window.document }

    function getDom (page) {
      // let url = PROTOCOL + '//' + HOST + ':' + PORT + WEBROOT + page
      return new JSDOM(Fs.readFileSync(path, 'utf8'), Object.assign({
        url: url
      }, WAITFOR.length ? {
        runScripts: "dangerously",
        resources: "usable",
        // resources: new ChattyResourceLoader(),
      } : {}))
    }
  }

  // strip hash off URL
  static noHash (elt) {
    const u = new URL(elt.href)
    u.hash = ''
    return u.href
  }
}

// Handy logging resource loader for JSDOM
class ChattyResourceLoader extends jsdom.ResourceLoader {
  constructor (document) {
    super(Object.assign({}, { userAgent: 'sphinx-to-tr' }, document))
  }

  fetch (url, { element, onLoad, onError }) {
    console.warn('ChattyResourceLoader: fetch(', url, ')')
    const request = super.fetch(url, { element, onLoad, onError })
    return request
  }
}

// Map of arrays (keeps track of total members)
class ArrayMap extends Map {
  total = 0

  set (key, value) {
    ++this.total
    if (this.has(key)) {
      this.get(key).push(value)
      return this
    } else {
      return super.set(key, [value])
    }
  }

  delete (key) {
    if (!this.has(key))
      return false
    this.total -= this.get(key).length
    return super.delete(key)
  }
}

(async () => {
if (process.argv.length < 3) {
  const exe = process.argv[1]
  fail(`Usage: ${exe} <sphinx-index-file> [non-numbered-section]...
${exe} ../../webassembly/spec/core/index.html 'Appendix' 'another Appendix'`, -1)
}
  console.log(await new SphinxToTr(process.argv[2], process.argv.slice(3)).index())
})()

function fail (message, code) {
  console.error(message)
  process.exit(code)
}

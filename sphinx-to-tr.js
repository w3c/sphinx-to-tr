#!/usr/bin/env node

const Fs = require('fs')
const Path = require('path')
const Jsdom = require("jsdom")
const { JSDOM } = Jsdom

// WAITFOR loads scripts and waits for the listed variables to be
// initialize. Many scripts do not run in JSDOM so this is sensitive to JSDOM
// limitiations
const WAITFOR = [] // ['$']

// How long to wait for a doc to load. Increase when using WAITFOR.
const LOAD_TIMEOUT = 1000

// Working class to translate Sphinx docs to W3C TR/ format
class SphinxToTr {
  constructor (path) {
    const parsed = Path.parse(path)

    // File path to Sphinx source
    this.relDir = parsed.dir

    // Sphinx index page
    this.startPage = parsed.name + parsed.ext

    // What document globals should be set in order to process doc
    this.waitFor = WAITFOR // hard-wired until creating real CLI app

    // Cache loaded pages, mostly so we don't have to load index.html again
    this.pageCache = new Map()
  }

  /** indexPage - Crawl through sphinx index page to number sections
   */
  async indexPage (
    // Which labels should not get numbers
    appendixLabels,

    // CSS selector for root of TOC
    selector = 'toctree-wrapper',

    // Sphinx index page
    page = this.startPage
  ) {
    const { dom, document, url, dir, find } = await this.loadPage(page, LOAD_TIMEOUT)

    const [primaryToc] = find('.toctree-wrapper > ul') // sphinx seems to have three unclassed <ul/>s
    const ret = new Map()
    visit(primaryToc, '')
    return ret

    function visit (ul, leader) {
      const numberableSections = SphinxToTr.children(ul, 'li')
            .filter( (elt) => appendixLabels.indexOf(elt.textContent) === -1 )
      numberableSections.forEach( (li, idx) => {
        const secNo = leader + (idx + 1)

        const az = SphinxToTr.children(li, 'a')
        if (az.length !== 1)
          throw new Error(`found ${az.length} <a/> elements in TOC entry ${li.outerHTML}`)
        const a = az[0]
        const urlStr = a.href
        if (!(urlStr.startsWith(dir)))
          throw new Error(`apparent href to doc outside TR/ tree <${urlStr}> in  ${li.outerHTML}`)
        const relStr = urlStr.substr(dir.length)

        // Return if this is an un-numbered TOC entry.
        if (appendixLabels.indexOf(a.textContent) !== -1)
          return

        // Renumber index entry.
        const linkText = SphinxToTr.addNumber(document, a, secNo, null)

        // Record name of this TOC entry.
        ret.set(relStr, { elt: li, secNo, linkText })

        // Don't bother writing; sidebar renumbering will write out all changes.

        // Renumber nested children.
        const ulz = SphinxToTr.children(li, 'ul')
        if (ulz.length > 1)
          throw new Error(`found ${ulz.length} <ul/> elements in TOC entry ${li.outerHTML}`)
        if (ulz.length === 1)
          visit(ulz[0], secNo + '.')
      })
    }
  }

  /** copyRecursively - Recursively copy each referenced doc
   */
  async copyRecursively (
    numberedSections,
    page = this.startPage,
    seen = new InitializedSet(page)
  ) {
    const { dom, document, url, dir, find } = await this.loadPage(page, LOAD_TIMEOUT)

    // List all hrefs just as an FYI.
    const urlStrToElements =
          SphinxToTr.localHrefs(find('a'), dir)
          .reduce( (acc, [urlStr, elt]) => acc.set(urlStr, elt), new ArrayMap())
    urlStrToElements.delete('')
    console.log(`${page} has ${urlStrToElements.total} references to ${urlStrToElements.size} descendants of ${dir}`)

    // add section numbers to sidebar
    const az = SphinxToTr.localHrefs(find('[role=navigation] a'), dir)
    return await Promise.all(az.reduce((acc, [relUrl, a]) => {
      if (!numberedSections.has(relUrl)) {
        // console.warn(`skipping un-numbered reference in ${a.outerHTML}`)
        return acc
      }
      const entry = numberedSections.get(relUrl)

      // Renumber index entry.
      SphinxToTr.addNumber(document, a, entry.secNo, entry.linkText)
      acc.push(Promise.resolve({page, relUrl, entry}))

      if (!seen.has(relUrl)) {
        seen.add(relUrl)
        acc.push(this.copyRecursively(numberedSections, relUrl, seen))
      }

      return acc
    }, []))
  }

  static span (document, text, classes) {
    const span = document.createElement('span')
    span.textContent = text
    classes.forEach( (c) => span.classList.add(c) )
    return span
  }

  /**
   * @returns - i dunno, but it's not useful yet.
   */
  async loadPage (page, timeout) {
    if (this.pageCache.has(page))
      return this.pageCache.get(page)

    // calculate relative path and effective URL
    const path = Path.join(__dirname, this.relDir, page)
    const url = new URL('file://' + path)
    const dir = url.href.substr(0, url.href.length - page.length) // new URL('..', url).href

    const dom = new JSDOM(Fs.readFileSync(path, 'utf8'), Object.assign({
      url: url
    }, this.waitFor.length ? {
      runScripts: "dangerously",
      resources: "usable",
      // resources: new ChattyResourceLoader(),
    } : {}))
    const document = dom.window.document

    // work around bug in MathJax appVersion parser
    // dom.window.navigator.appVersion = dom.window.navigator.userAgent

    // Load the page with a timeout
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

    this.waitFor.forEach( (wf) => {
      if (!(wf in dom.window))
        throw new Error(`${wf} failed to load`)
    })

    // convenience function find to query DOM
    const find =
          // (selectors, from) => (from ? dom.window.$(from).find(selectors) : dom.window.$(selectors)).get() // jQuery
          (selectors, from) => [...(from || document).querySelectorAll(selectors)] // DOM

    // cache and return
    const ret = { dom, path, url, dir, document, find }
    this.pageCache.set(page, ret)
    return ret

  }

  static addNumber (document, a, secNo, linkText) {
    if (linkText) {
      if (linkText !== a.textContent)
        throw new Error(`expected link to ${a.href} to have link text "${linkText}" - saw ${a.textContent}`)
    } else {
      linkText = a.textContent
    }
    a.textContent = ''
    a.appendChild(SphinxToTr.span(document, secNo, ['secno']))
    a.appendChild(document.createTextNode(' '))
    a.appendChild(SphinxToTr.span(document, linkText, ['content']))
    return linkText
  }

  static localHrefs (elts, dir) {
    return elts
      .map( (elt) => [SphinxToTr.noHash(elt.href), elt] )
      .filter( ([urlStr, elt]) => [urlStr.startsWith(dir), elt] )
      .map( ([urlStr, elt]) => [urlStr.substr(dir.length), elt] )
  }

  // strip hash off URL
  static noHash (urlStr) {
    const u = new URL(urlStr)
    u.hash = ''
    return u.href
  }

  // Manually walk children because there's no support for
  // :scope and I don't know how to find Element.prototype
  // needed for <https://stackoverflow.com/a/17989803/1243605>.
  // const az = find(':scope > a', li)
  static children (parent, localName) {
    return [...parent.children].filter( (elt) => elt.localName === localName )
  }
}

// A set constructed with initial entries
class InitializedSet extends Set {
  constructor (relUrl) {
    super()
    for (let i = 0; i < arguments.length; ++i)
      this.add(arguments[i])
  }
}

// Handy logging resource loader for JSDOM
class ChattyResourceLoader extends Jsdom.ResourceLoader {
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
  try {
    const translator = new SphinxToTr(process.argv[2])
    const index = await translator.indexPage(process.argv.slice(3))
    // console.log(index)
    const copied = await translator.copyRecursively(index)
    // console.log(JSON.stringify(copied, null, 2))
  } catch (e) {
    fail(e, -1)
  }
})()

function fail (message, code) {
  console.error(message)
  process.exit(code)
}

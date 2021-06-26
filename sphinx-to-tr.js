#!/usr/bin/env node

const Fs = require('fs')
const Path = require('path')
const jsdom = require("jsdom")
const { JSDOM } = jsdom
const PROTOCOL = 'http:'
const HOST = 'www.w3.org'
const PORT = 80
const WEBROOT = '/TR/'

// Working class to translate Sphinx docs to W3C TR/ format
class SphinxToTr {
  constructor (path) {
    const parsed = Path.parse(path)
    this.relDir = parsed.dir
    this.page = parsed.name + parsed.ext
  }

  async index () {
    try {
      const { dom, document, url } = await this.loadPage(this.page, 100)
      const dir = new URL('..', url).href
      if (!('$' in dom.window))
        throw new Error('jQuery failed to load')
      const find =
            // (selectors, from) => (from ? dom.window.$(from).find(selectors) : dom.window.$(selectors)).get() // jQuery
            (selectors, from) => [...(from || document).querySelectorAll(selectors)] // DOM
      const urlStrToElements =
            find('a')
            .map( (elt) => [SphinxToTr.noHash(elt), elt] )
            .filter( ([urlStr, elt]) => [urlStr.startsWith(dir), elt] )
            .map( ([urlStr, elt]) => [urlStr.substr(dir.length), elt] )
            .reduce( (acc, [urlStr, elt]) => acc.set(urlStr, elt), new ArrayMap())
      urlStrToElements.delete('')
      console.log(`${this.page} has ${urlStrToElements.total} references to ${urlStrToElements.size} descendants of ${dir}`)
      
      console.log(('li', find('[role=navigation] ul')[0]))
      // document.documentElement.outerHTML
    } catch (e) {
      console.warn('caught:', e)
    }
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
      return new JSDOM(Fs.readFileSync(path, 'utf8'), {
        url: url,
        runScripts: "dangerously",
        resources: "usable",
        // resources: new ChattyResourceLoader(),
      })
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

new SphinxToTr(process.argv[2]).index()


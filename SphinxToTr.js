"use strict"

const Fs = require('fs')
const Path = require('path')
const Jsdom = require("jsdom")
const { InitializedSet, ArrayMap, TableOfContents } = require('./lib/containers')
const ChattyResourceLoader = require('./lib/ChattyResourceLoader')
const { JSDOM } = Jsdom
const { toHTML, write } = require("respec/tools/respecDocWriter.js");

// How long to wait for a doc to load. Increase when using WAIT_FOR.
const LOAD_TIMEOUT = 1000

// WAIT_FOR loads scripts and waits for the listed window variables to be
// initialize. Many scripts do not run in JSDOM so this is sensitive to JSDOM
// limitiations
const WAIT_FOR = [] // ['$']

// Debug by showing what pages are being loaded.
const CHATTY_LOADER = false

// Working class to translate Sphinx docs to W3C TR/ format
class SphinxToTr {
  constructor (path) {
    const parsed = Path.parse(path)

    // File path to Sphinx source
    this.relDir = parsed.dir

    // Sphinx index page
    this.startPage = parsed.name + parsed.ext

    // What document globals should be set in order to process doc
    this.waitFor = WAIT_FOR // hard-wired until creating real CLI app

    // Cache loaded pages, mostly so we don't have to load index.html again
    this.pageCache = new Map()
  }

  /** indexPage - Crawl through sphinx index page to number sections
   */
  async indexPage (
    // Which labels should not get numbers
    appendixLabels,

    // CSS selector for root of TOC
    selector = '.toctree-wrapper',

    // Sphinx index page
    page = this.startPage,

    // Leader text for section
    leader = '',

  ) {
    const self = this

    // Map to return
    const ret = new TableOfContents();
    (await visitPage(page, leader)).forEach( (li) => ret.add(li) )
    return ret

    async function visitPage (page, leader) {
      const { dom, document, url, dir, find } = await self.loadPage(page, LOAD_TIMEOUT)

      const tocs = find(selector + ' > ul')
      return tocs.length === 0
        ? []
        : await visitUl(tocs[0], leader) // sphinx seems to have three unclassed <ul/>s; visit 1st

      async function visitUl (ul, leader) {
        const numberableSections = SphinxToTr.childrenByName(ul, 'li')
              .filter( (elt) => appendixLabels.indexOf(elt.textContent) === -1 )
        return await Promise.all(numberableSections.map( async (li, idx) => {
          const secNo = leader + (idx + 1)

          const az = SphinxToTr.childrenByName(li, 'a')
          if (az.length !== 1)
            throw new Error(`found ${az.length} <a/> elements in TOC entry ${li.outerHTML}`)
          const a = az[0]
          const urlStr = a.href
          if (!(urlStr.startsWith(dir)))
            throw new Error(`apparent href to doc outside TR/ tree <${urlStr}> in  ${li.outerHTML}`)
          const relStr = urlStr.substr(dir.length)

          // Renumber index entry.
          const linkText = a.textContent

          // Return if this is an un-numbered TOC entry.
          if (appendixLabels.indexOf(a.textContent) !== -1) {
            return ret.makeEntry(null, linkText, relStr, [])
          } else {

            // Renumber nested children.
            const ulz = SphinxToTr.childrenByName(li, 'ul')
            if (ulz.length > 1)
              throw new Error(`found ${ulz.length} <ul/> elements in TOC entry ${li.outerHTML}`)

            const nested = (urlStr.startsWith(dir) && urlStr.endsWith('index.html'))
                  // index pages have detailed TOCs and take precedence over embeded <ul/>s.
                  ? await visitPage(urlStr.substr(dir.length), secNo + '.')
                  // a <ul/> contains nested TOC entries on this page.
                  : (ulz.length === 1)
                  ? await visitUl(ulz[0], secNo + '.')
                  : null

            // Record name of this TOC entry.
            return ret.makeEntry(secNo, linkText, relStr, nested)
          }
        }))
      }
    }
  }

  /**
   * @returns: elements to append to <head/>
   */
  async updateFrontMatter (
    // W3C Respec doc from which to steal front matter
    respecSrc, respecOptions,

    // CSS selector for root of TOC
    selector = '[role=main] > div',

    // Sphinx index page
    page = this.startPage
  ) {
    const { dom, document, url, dir, find } = await this.loadPage(page, LOAD_TIMEOUT)
    // globalThis.window = dom.window
    try {
      const { html, errors, warnings } = await toHTML(respecSrc, respecOptions);
      warnings.forEach( (w) => console.warn(w) )
      if (errors.length)
        throw Error(`respec.toHTML returned ${errors.length} errors: ${errors.join('\n')}`)

      const respec = {
        dom: new JSDOM(html, { url: respecSrc }),
      }
      respec.doc = respec.dom.window.document
      respec.find = SphinxToTr.makeFind(respec.doc)

      // copy respec <head/>
      const respecHead = respec.find('head')[0]
      {
        const outHead = find('head')[0]
        // await SphinxToTr.domContentLoaded(dom, respecOptions.timeout, url)

        steal('head > meta[charset]')
        const generator = steal('head > meta[name=generator]', false)
        outHead.prepend(generator)
        generator.setAttribute('content', 'sphinx-to-tr @@0.0.0, ' + generator.getAttribute('content'))
        steal('head > meta[name=viewport]')
        steal('head > title')
      }
      const headMatter = [...respecHead.children]

      // grab elements we want to keep from the sphinx page
      const searchBox = find('#searchbox')[0]
      const searchScript = searchBox.nextElementSibling
      const sphinxGenerated = searchBox.previousElementSibling
      const immediateLis = ([...find('.toctree-wrapper > ul > li')])
            .concat([...find('.simple > li')])

      // copy respec <body/>
      const body = steal('body')
      // console.log(body.outerHTML)
      const newToc = find('[id=toc]')[0]

      // replace sphinx sidebar TOC with more complete one from the main page
      {
        const newTocOl = SphinxToTr.childrenByClass(newToc, 'toc')[0]
        newTocOl.textContent = '' // clear out dummy entry
        immediateLis.forEach( (li) => {
          li.remove()
          newTocOl.append(li)
        })
        newToc.setAttribute('role', 'navigation')
        newToc.append(sphinxGenerated)
        newToc.append(searchBox)
        newToc.append(searchScript)
      }

      // Don't bother writing; `copyRecursively` will write out all changes.

      return headMatter

      function steal (selector, replace = true) {
        const src = one(respec.find, 'source', 1)
        const copy = SphinxToTr.adopt(document, src)
        src.remove()
        const target = one(find, 'target', replace ? 1 : 0)
        if (replace)
          target.replaceWith(copy)
        return copy

        function one (finder, label, expectCount) {
          const ret = finder(selector)
          if (ret.length !== expectCount)
            throw new Error(`replacing ${selector}, expected 1 match in ${label}, got [${
ret.map( (elt) => elt.outerHTML ).join(',\n')
}]`)
          return ret[0]
        }
      }
    } catch (e) {
      console.error('updateFrontMatter:', e)
      process.exit(-1)
    }
  }

  /** copyRecursively - Recursively copy each referenced doc
   * @returns - i dunno, but it's not useful yet.
   */
  async copyRecursively (
    headMatter,
    toc,
    outDir,
    page = this.startPage,
    seen = new InitializedSet(page)
  ) {
    const { dom, document, url, dir, find } = await this.loadPage(page, LOAD_TIMEOUT)
    // div class="sphinxsidebar" role="navigation" aria-label="main navigation"
    const oldNavs = find('[role=navigation]') // [id=toc]
    let az = []
      az = SphinxToTr.localHrefs(find('[id=toc][role=navigation] a'), dir)

    if (oldNavs.length === 1 || oldNavs.length === 2) { // back to top link

      // transplant headMatter into <head/>
      {
        const outHead = find('head')[0]
        headMatter.forEach( (elt) => {
          const copy = SphinxToTr.adopt(document, elt)
          outHead.append(copy)
        })
      }

      // remove old sidebar
      oldNavs[0].remove();

      [...find('a.headerlink')].forEach( (a) => toc.updateAnchor(document, a, page) )

      // add the TOC
      find('body')[0].prepend(toc.getHtml(document, page))

      const lastStyleSheet = document.createElement('link')
      lastStyleSheet.setAttribute('rel', 'stylesheet')
      lastStyleSheet.href = 'https://www.w3.org/StyleSheets/TR/2016/W3C-ED'
      find('head')[0].prepend(lastStyleSheet)
    }

    // write out the file
    const outFilePath = Path.join(outDir, page)
    Fs.mkdirSync(Path.dirname(outFilePath), {recursive: true})
    const text = document.documentElement.outerHTML
    Fs.writeFileSync(outFilePath, text, {encoding: 'utf-8'})
    console.log(`${outFilePath}: ${text.length} chars`)

    const visited = await Promise.all(az.reduce( (acc, [relUrl, a]) => {
      if (seen.has(relUrl))
        return acc
      seen.add(relUrl)
      return acc.concat(this.copyRecursively(headMatter, toc, outDir, relUrl, seen))
    }, []))

    return {page, visited}

    function ensureDirectoryExistence(filePath) {
      var dirname = Path.dirname(filePath);
      if (Fs.existsSync(dirname)) {
        return true;
      }
      ensureDirectoryExistence(dirname);
      Fs.mkdirSync(dirname);
    }
  }

  /**
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
      resources: CHATTY_LOADER
        ? new ChattyResourceLoader()
        : "usable",
    } : {}))
    // work around bug in MathJax appVersion parser
    // dom.window.navigator.appVersion = dom.window.navigator.userAgent

    await SphinxToTr.domContentLoaded(dom, timeout, page)

    this.waitFor.forEach( (wf) => {
      if (!(wf in dom.window))
        throw new Error(`${wf} failed to load`)
    })

    const document = dom.window.document
    const find = SphinxToTr.makeFind(document)

    // cache and return
    const ret = { dom, path, url, dir, document, find }
    this.pageCache.set(page, ret)
    return ret

  }

  // Static helpers

  static domContentLoaded (dom, timeout) {
    // Load the page with a timeout
    let timer = null;
    return Promise.race([
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
  }

  // Adopt elt into document. abstracted in case JSODM impl changes
  static adopt (document, elt) {
    const ret = elt.cloneNode(true)
    document.adoptNode(ret)
    return ret
  }

  // convenience function find to query DOM
  static makeFind (document) {
    const find =
          // (selectors, from) => (from ? dom.window.$(from).find(selectors) : dom.window.$(selectors)).get() // jQuery
          (selectors, from) => [...(from || document).querySelectorAll(selectors)] // DOM
    return find
  }

  // Create a span element with given text and classes
  static span (document, text, classes) {
    const span = document.createElement('span')
    span.textContent = text
    classes.forEach( (c) => span.classList.add(c) )
    return span
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
  static childrenByName (parent, localName) {
    return [...parent.children].filter( (elt) => elt.localName === localName )
  }

  static childrenByClass (parent, cls) {
    return [...parent.children].filter( (elt) => elt.classList.contains(cls) )
  }
}

module.exports = SphinxToTr

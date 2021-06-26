#!/usr/bin/env node

const Fs = require('fs')
const Path = require('path')
const jsdom = require("jsdom")
const { JSDOM } = jsdom
const PROTOCOL = 'http:'
const HOST = 'www.w3.org'
const PORT = 80
const WEBROOT = '/TR/'
const FSROOT = '../../webassembly/spec/core/'

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

async function index (page) {
  try {
    const { dom, url } = await loadPage(page, 100)
    const dir = new URL('..', url).href
    if (!('$' in dom.window))
      throw new Error('jQuery failed to load')
    const find =
          (selectors) => dom.window.$(selectors).get() // jQuery
          // (selectors) => [...dom.window.document.querySelectorAll(selectors)] // DOM
    const urlStrs =
          find('a')
          .map( (elt) => noHash(elt) )
          .filter( (urlStr) => urlStr.startsWith(dir) )
          .map( (urlStr) => urlStr.substr(dir.length) )
          // .sort()
          // .filter( (urlStr, index, a) => index === a.indexOf(urlStr) )
          .reduce( (acc, urlStr) => acc.set(urlStr, 1), new Map())
    console.log(`${urlStrs.length} descendants of ${dir}`)
    
    console.log(urlStrs)
  } catch (e) {
    console.warn('caught:', e)
  }
}

async function loadPage (page, timeout) {
  const path = Path.join(__dirname, FSROOT, page) // paths relative to repo root
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
  return { dom, path, url }

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

function noHash (elt) {
  const u = new URL(elt.href)
  u.hash = ''
  return u.href
}

index('index.html')


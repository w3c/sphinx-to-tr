"use strict"
const Jsdom = require("jsdom")

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

module.exports = ChattyResourceLoader

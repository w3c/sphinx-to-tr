// A set constructed with initial entries
class InitializedSet extends Set {
  constructor (relUrl) {
    super()
    for (let i = 0; i < arguments.length; ++i)
      this.add(arguments[i])
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

// Toc is a table of contents structure which generates a sidebar TOC
class Toc {
  urlStr2li = new Map()
  urlStr2secNo = new Map()

  constructor (document, youAreHereClassName = 'youAreHere') {
    this.document = document
    this.youAreHereClassName = youAreHereClassName
    this.root = document.createElement('ol')
    this.root.className = 'toc'
    this.nav = document.createElement('nav')
    this.nav.id = 'toc'
    this.nav.setAttribute('role', 'navigation')
    const h2 = document.createElement('h2')
    h2.textContent = 'Table of Contents'
    h2.id = 'table-of-contents'
    h2.className = 'introductory'
    this.nav.append(h2)
    this.nav.append(this.root)
  }

  add (secNo, linkText, urlStr, nested) {
    const [li, a, secSpan, textSpan] =
          ([['li', 'tocline'], ['a', 'toxref'], ['span', 'secno'], ['span', 'content']])
          .map( ([tag, className]) => {
            const ret = this.document.createElement(tag)
            ret.className = className
            return ret
          })
    a.href = urlStr
    if (secNo) {
      secSpan.textContent = secNo
      a.append(secSpan)
    }
    textSpan.textContent = linkText
    a.append(textSpan)
    li.append(a)
    if (nested !== null) {
      const ul = this.document.createElement('ul')
      nested.forEach( (li) => ul.append(li) )
      li.append(ul)
    }
    this.urlStr2li.set(urlStr, li)
    if (secNo)
      this.urlStr2secNo.set(urlStr, secNo)
    return li
  }

  get (urlStr = undefined) {
    const li = this.urlStr2li.get(urlStr)
    // since urlStr2li points to uncloned node, tweak the original
    if (li)
      li.classList.add(this.youAreHereClassName)
    // clone to place in another document
    const ret = this.nav.cloneNode(true)
    // clean up
    if (li)
      li.classList.remove(this.youAreHereClassName)
    return ret
  }

  updateAnchor (a, relStr) {
    if (!this.urlStr2secNo.has(relStr))
      return false
    const secNo = this.urlStr2secNo.get(relStr)
    console.warn(`add ${secNo} to ${a.outerHTML}`)
    return true
  }
}

module.exports = { InitializedSet, ArrayMap, Toc }

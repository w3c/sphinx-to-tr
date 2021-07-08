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

// TableOfContents is a table of contents structure which generates a sidebar TOC.
// This API is a mild PITA 'cause the caller has to make an entry after all nested entries are made.
class TableOfContents {
  urlStr2li = new Map()
  urlStr2secNo = new Map()
  rootLis = []

  /** construct a TOC entry but don't add it to rootStrucs
   */
  makeEntry (secNo, linkText, urlStr, nested) {
    const li = { secNo, linkText, urlStr, nested }

    this.urlStr2li.set(urlStr, li)
    if (secNo)
      this.urlStr2secNo.set(urlStr, secNo)
    return li
  }

  /** liStruc is a top-level TOC entry
   */
  add (liStruc) {
    this.rootLis.push(liStruc)
  }

  /** @returns a W3C-like TOC html structure
   */
  getHtml (document, page = undefined, youAreHereClassName = 'youAreHere') {
    const self = this
    const toRoot = (page || '').split('/').slice(0, -1).map( s => '../' ).join('')
    const ol = document.createElement('ol')
    ol.className = 'toc'
    const nav = document.createElement('nav')
    nav.id = 'toc'
    nav.setAttribute('role', 'navigation')
    const h2 = document.createElement('h2')
    h2.textContent = 'Table of Contents'
    h2.id = 'table-of-contents'
    h2.className = 'introductory'
    nav.append(h2)
    nav.append(ol)

    // add the top-level <li/>s to ol
    this.rootLis.forEach( (li) => ol.append(genLi(li)) )

    return nav

    function genLi (liStruct) {
      const {secNo, linkText, urlStr, nested} = liStruct
      const [li, a, secSpan, textSpan] =
            ([['li', 'tocline'], ['a', 'toxref'], ['span', 'secno'], ['span', 'content']])
            .map( ([tag, className]) => {
              const ret = document.createElement(tag)
              ret.className = className
              return ret
            })
      a.href = toRoot + urlStr
      if (secNo) {
        secSpan.textContent = secNo
        a.append(secSpan)
      }
      textSpan.textContent = linkText
      a.append(textSpan)
      li.append(a)
      if (nested !== null) {
        const ul = document.createElement('ul')
        nested.forEach( (li) => ul.append(genLi(li)) )
        li.append(ul)
      }
      if (urlStr === page)
        li.classList.add(youAreHereClassName)
      return li
    }
  }

  updateAnchor (a, relStr) {
    if (!this.urlStr2secNo.has(relStr))
      return false
    const secNo = this.urlStr2secNo.get(relStr)
    console.warn(`add ${secNo} to ${a.outerHTML}`)
    return true
  }
}

module.exports = { InitializedSet, ArrayMap, TableOfContents }

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

module.exports = { InitializedSet, ArrayMap }

const colors = require("colors");
const { marked } = require("marked");

class Renderer extends marked.Renderer {
  strong(text) {
    return colors.bold(text);
  }
  em(text) {
    return colors.italic(text);
  }
  codespan(text) {
    return colors.underline(unescape(text));
  }
  paragraph(text) {
    return text;
  }
  link(href, _title, text) {
    return `[${text}](${colors.blue.dim.underline(href)})`;
  }
  list(body, _orderered) {
    return `\n${body}`;
  }
  listitem(text) {
    return `* ${text}\n`;
  }
}

class Logger {
  /** @param {boolean} verbose */
  constructor(verbose) {
    this.verbose = verbose;
  }

  /**
   * @param {string} message
   * @param {number} timeRemaining
   */
  info(message, timeRemaining) {
    if (!this.verbose) return;
    const header = colors.dim.bgWhite.black.bold("[INFO]");
    const time = colors.dim(`[Timeout: ${timeRemaining}ms]`);
    console.error(header, time, message);
  }

  /**
   * @typedef {import("./respecDocWriter.js").RsError} RsError
   * @param {RsError} rsError
   */
  error(rsError) {
    const header = colors.bgRed.white.bold("[ERROR]");
    const message = colors.red(this._formatMarkdown(rsError.message));
    console.error(header, message);
    if (rsError.plugin) {
      this._printDetails(rsError);
    }
  }

  /** @param {RsError} rsError */
  warn(rsError) {
    const header = colors.bgYellow.black.bold("[WARNING]");
    const message = colors.yellow(this._formatMarkdown(rsError.message));
    console.error(header, message);
    if (rsError.plugin) {
      this._printDetails(rsError);
    }
  }

  /** @param {Error | string} error */
  fatal(error) {
    const header = colors.bgRed.white.bold("[FATAL]");
    const message = colors.red(error.stack || error);
    console.error(header, message);
  }

  _formatMarkdown(str) {
    if (typeof str !== "string") return str;
    return marked(str, { smartypants: true, renderer: new Renderer() });
  }

  /** @param {import("./respecDocWriter").ReSpecError} rsError */
  _printDetails(rsError) {
    const print = (title, value) => {
      if (!value) return;
      const padWidth = "Plugin".length + 1; // "Plugin" is the longest title
      const paddedTitle = `${title}:`.padStart(padWidth);
      console.error(" ", colors.bold(paddedTitle), this._formatMarkdown(value));
    };
    print("Count", rsError.elements && String(rsError.elements.length));
    print("Plugin", rsError.plugin);
    print("Hint", rsError.hint);
  }
}

module.exports = Logger

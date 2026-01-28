"use strict";
class SyntaxHighlighter {
  constructor() {
    this.lineModes = [];
    this.lineState = [];
  }
  analyze(lines, fileName = '') {
    let mode = 'html';
    let lockedMode = false;
    if (fileName.match(/\.(js|mjs|cjs|ts|json)$/i)) {
      mode = 'javascript';
      lockedMode = true;
    } else if (fileName.match(/\.css$/i)) {
      mode = 'css';
      lockedMode = true;
    }
    let jsCssState = {
      comment: false,
      quote: null,
      regex: false
    };
    let htmlBlockComment = false;
    this.lineModes = new Array(lines.length);
    this.lineState = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let thisLineMode = mode;
      if (!lockedMode) {
        if (mode === 'html') {
          if (!htmlBlockComment && line.match(/^\s*<script/i)) {
            thisLineMode = 'html';
            if (!line.match(/<\/script/i)) mode = 'javascript';
          } else if (!htmlBlockComment && line.match(/^\s*<style/i)) {
            thisLineMode = 'html';
            if (!line.match(/<\/style/i)) mode = 'css';
          }
        } else if (mode === 'javascript') {
          if (!jsCssState.comment && !jsCssState.quote && !jsCssState.regex && line.match(/<\/script/i)) {
            thisLineMode = 'html';
            mode = 'html';
          } else {
            thisLineMode = 'javascript';
          }
        } else if (mode === 'css') {
          if (!jsCssState.comment && !jsCssState.quote && line.match(/<\/style/i)) {
            thisLineMode = 'html';
            mode = 'html';
          } else {
            thisLineMode = 'css';
          }
        }
      }
      if (thisLineMode === 'html') {
        const state = this.checkHtmlCommentState(line, htmlBlockComment);
        this.lineState[i] = htmlBlockComment ? 'html-comment' : null;
        htmlBlockComment = state;
        if (htmlBlockComment) this.lineState[i] = 'html-comment';
      } else {
        if (jsCssState.comment) this.lineState[i] = 'comment';
        else if (jsCssState.quote) this.lineState[i] = 'string-' + jsCssState.quote;
        else this.lineState[i] = null;
        jsCssState = this.checkJsCssState(line, jsCssState);
      }
      this.lineModes[i] = thisLineMode;
    }
  }
  checkJsCssState(line, currentState) {
    if (line.length > 3000) {
      return currentState;
    }
    let inComment = currentState.comment;
    let quoteChar = currentState.quote;
    let inRegex = currentState.regex;
    let escape = false;
    let lastChar = '';
    let currentWord = '';
    let lastWord = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (/[a-zA-Z0-9_$]/.test(char)) {
        currentWord += char;
      } else {
        if (currentWord.length > 0) lastWord = currentWord;
        currentWord = '';
      }
      if (inComment) {
        if (char === '*' && next === '/') {
          inComment = false;
          i++;
        }
      } else if (quoteChar) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === quoteChar) {
          quoteChar = null;
        }
      } else if (inRegex) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '/') {
          inRegex = false;
        }
      } else {
        if (char === '"' || char === "'" || char === '`') {
          quoteChar = char;
        } else if (char === '/' && next === '*') {
          inComment = true;
          i++;
        } else if (char === '/' && next === '/') {
          break;
        } else if (char === '/') {
          const keywords = ['return', 'case', 'throw', 'await', 'typeof', 'void', 'yield', 'delete'];
          const symbols = ['(', '=', ',', ':', '?', '[', '{', '!', '&', '|', ';', '+', '-', '*', '/', '%', '^', '<', '>', '~'];
          if (symbols.includes(lastChar) || keywords.includes(lastWord) || lastChar === '') {
            inRegex = true;
          }
        }
      }
      if (/\S/.test(char)) lastChar = char;
    }
    return {
      comment: inComment,
      quote: quoteChar,
      regex: inRegex
    };
  }
  checkHtmlCommentState(line, inComment) {
    if (line.length > 3000) {
      return inComment;
    }
    let state = inComment;
    const startMarker = '<' + '!--';
    const endMarker = '-' + '->';
    for (let i = 0; i < line.length; i++) {
      if (state) {
        if (line.substr(i, 3) === endMarker) {
          state = false;
          i += 2;
        }
      } else {
        if (line.substr(i, 4) === startMarker) {
          state = true;
          i += 3;
        }
      }
    }
    return state;
  }
  highlight(text, rowIndex) {
    if (!text) return '&nbsp;';
    if (text.length > 3000) {
      return this.escapeHTML(text);
    }
    const mode = (this.lineModes && this.lineModes[rowIndex]) ? this.lineModes[rowIndex] : 'html';
    const state = (this.lineState && this.lineState[rowIndex]) ? this.lineState[rowIndex] : null;
    let escaped = this.escapeHTML(text);
    if (state === 'comment') {
      const endIdx = escaped.indexOf('*/');
      if (endIdx === -1) {
        return '<span class="token comment">' + escaped + '</span>';
      } else {
        const commentPart = escaped.substring(0, endIdx + 2);
        const codePart = escaped.substring(endIdx + 2);
        let rest = '';
        if (mode === 'javascript') rest = this.highlightJS(codePart);
        else if (mode === 'css') rest = this.highlightCSS(codePart);
        else rest = codePart;
        return '<span class="token comment">' + commentPart + '</span>' + rest;
      }
    }
    if (state && state.startsWith('string-')) {
      const quote = state.substring(7);
      let esc = false;
      let rawEndIdx = -1;
      for (let i = 0; i < text.length; i++) {
        if (esc) {
          esc = false;
          continue;
        }
        if (text[i] === '\\') {
          esc = true;
          continue;
        }
        if (text[i] === quote) {
          rawEndIdx = i;
          break;
        }
      }
      if (rawEndIdx === -1) {
        return '<span class="token string">' + escaped + '</span>';
      } else {
        const strPart = this.escapeHTML(text.substring(0, rawEndIdx + 1));
        const codePart = this.escapeHTML(text.substring(rawEndIdx + 1));
        let rest = '';
        if (mode === 'javascript') rest = this.highlightJS(codePart);
        else if (mode === 'css') rest = this.highlightCSS(codePart);
        else rest = codePart;
        return '<span class="token string">' + strPart + '</span>' + rest;
      }
    }
    if (state === 'html-comment') {
      const endIdx = escaped.indexOf('-' + '-' + '&gt;');
      if (endIdx === -1) {
        return '<span class="token comment">' + escaped + '</span>';
      } else {
        const commentPart = escaped.substring(0, endIdx + 6);
        const codePart = escaped.substring(endIdx + 6);
        return '<span class="token comment">' + commentPart + '</span>' + this.highlightHTMLLine(codePart);
      }
    }
    let result = '';
    if (mode === 'javascript') {
      result = this.highlightJS(escaped);
    } else if (mode === 'css') {
      result = this.highlightCSS(escaped);
    } else {
      result = this.highlightHTMLLine(escaped);
    }
    result = result.replace(/([ \t]+)$/, (match) => {
      const dots = match.replace(/ /g, '·').replace(/\t/g, '→   ');
      return '<span class="token trailing-space-mark">' + dots + '</span>';
    });
    return result.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF](?:\u200D[\uD800-\uDBFF][\uDC00-\uDFFF])*)/g,
      '<span class="token emoji" data-emoji="$1">$1</span>');
  }
  escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  highlightJS(code) {
    const pattern = /((?:^|[:=,(\[{!&|?;]\s*|return\s+|case\s+|throw\s+|await\s+|typeof\s+|void\s+|yield\s+|delete\s+)\/(?![*\/])(?:\\.|[^\\\r\n\/])+\/[gimyus]{0,6})|(\/\*[\s\S]*?\*\/|\/\/.*)|(".*?"|'.*?'|`[\s\S]*?`|`[\s\S]*?$)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|this|async|await|import|export|from|try|catch|switch|case|break|default|typeof|void|delete)\b)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\())/g;
    return code.replace(pattern, (match, regex, comment, string, keyword, number, func) => {
      if (regex) {
        const slashIdx = regex.indexOf('/');
        const prefix = regex.substring(0, slashIdx);
        const body = regex.substring(slashIdx);
        return prefix + '<span class="token string">' + body + '</span>';
      }
      if (comment) return '<span class="token comment">' + comment + '</span>';
      if (string) return '<span class="token string">' + string + '</span>';
      if (keyword) return '<span class="token keyword">' + keyword + '</span>';
      if (number) return '<span class="token number">' + number + '</span>';
      if (func) return '<span class="token function">' + func + '</span>';
      return match;
    });
  }
  highlightCSS(code) {
    try {
      const p = /(\/\*[\s\S]*?\*\/)|(".*?"|'.*?')|((-?\d+\.?\d*|\.\d+)[a-zA-Z%]*)|([\.#][\w-]+|(?<=[\}\s]|^)[a-zA-Z][\w-]*(?=\s*[\{\,\.#]))|([a-zA-Z-]+)(?=:)|(@[\w-]+)/g;
      return code.replace(p, (m, c, s, n, d, sel, prop, at) => {
        if (c) return '<span class="token comment">' + c + '</span>';
        if (s) return '<span class="token string">' + s + '</span>';
        if (n) return '<span class="token number">' + n + '</span>';
        if (sel) return '<span class="token selector">' + sel + '</span>';
        if (prop) return '<span class="token property">' + prop + '</span>';
        if (at) return '<span class="token keyword">' + at + '</span>';
        return m;
      });
    } catch (e) {
      return code;
    }
  }
  highlightHTMLLine(code) {
    let output = code;
    const commentRegex = /(&lt;!--[\s\S]*?--&gt;)/g;
    output = output.replace(commentRegex, '<span class="token comment">$1</span>');
    output = output.replace(/(&lt;\/?)(\w+)([^&]*?)(&gt;)/g, (m, bracket, tag, attrs, close) => {
      const styledAttrs = attrs.replace(/([a-zA-Z-]+)(=)(".*?"|'.*?')/g,
        '<span class="token attr-name">$1</span>=$3'
      );
      return bracket + '<span class="token html-tag">' + tag + '</span>' + styledAttrs + close;
    });
    return output;
  }
}
class HistoryManager {
  constructor(editor) {
    this.editor = editor;
    this.undoStack = [];
    this.redoStack = [];
    this.lastEditTime = 0;
  }
  record(op) {
    if (op.oldText.length > 1000000 || op.text.length > 1000000) {
      this.undoStack = [];
      this.redoStack = [];
      this.editor.setStatus("History cleared (Low Mem)");
      return;
    }
    const now = Date.now();
    const isTyping = op.text.length === 1 && op.oldText.length === 0;
    const isDel = op.oldText.length === 1 && op.text.length === 0;
    if (this.undoStack.length > 0 && (now - this.lastEditTime) < 500) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (isTyping && last.type === 'ins' && last.endRow === op.startRow && last.endCol === op.startCol) {
        last.text += op.text;
        last.endCol += op.text.length;
        last.cursorAfter = op.cursorAfter;
        this.lastEditTime = now;
        return;
      }
      if (isDel && last.type === 'del' && op.endRow === last.startRow && op.endCol === last.startCol) {
        last.oldText = op.oldText + last.oldText;
        last.startCol = op.startCol;
        last.cursorAfter = op.cursorAfter;
        this.lastEditTime = now;
        return;
      }
    }
    op.type = isTyping ? 'ins' : (isDel ? 'del' : 'blk');
    this.undoStack.push(op);
    this.redoStack = [];
    this.lastEditTime = now;
    if (this.undoStack.length > 300) this.undoStack.shift();
  }
  undo() {
    if (this.undoStack.length === 0) return;
    const op = this.undoStack.pop();
    this.redoStack.push(op);
    this.editor.applyEditInternal(op.startRow, op.startCol, op.cursorAfter.row, op.cursorAfter.col, op.oldText, false);
    this.editor.state.cursor = {
      ...op.cursorBefore
    };
    this.editor.finalizeUpdate();
    this.lastEditTime = 0;
  }
  redo() {
    if (this.redoStack.length === 0) return;
    const op = this.redoStack.pop();
    this.undoStack.push(op);
    this.editor.applyEditInternal(op.startRow, op.startCol, op.endRow, op.endCol, op.text, false);
    this.editor.state.cursor = {
      ...op.cursorAfter
    };
    this.editor.finalizeUpdate();
    this.lastEditTime = 0;
  }
}
class SearchManager {
  constructor(editor) {
    this.editor = editor;
    this.matches = [];
    this.currentIndex = -1;
    this.lastQuery = "";
  }
  find(query) {
    if (!query) return;
    if (query.toLowerCase() === this.lastQuery.toLowerCase() && this.matches.length > 0) return;
    this.matches = [];
    const lines = this.editor.state.lines;
    const lowerQuery = query.toLowerCase();
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r];
      const lowerLine = line.toLowerCase();
      let pos = lowerLine.indexOf(lowerQuery);
      while (pos !== -1) {
        this.matches.push({
          row: r,
          col: pos,
          len: query.length
        });
        pos = lowerLine.indexOf(lowerQuery, pos + 1);
      }
    }
    this.lastQuery = query;
    this.currentIndex = -1;
    const statEl = document.getElementById('search-stats');
    if (this.matches.length === 0) {
      statEl.textContent = "No matches";
    } else {
      statEl.textContent = `Found ${this.matches.length}`;
      this.findNext();
    }
  }
  reset() {
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    if (findInput) findInput.value = '';
    if (replaceInput) replaceInput.value = '';
    this.lastQuery = "";
    this.matches = [];
    this.currentIndex = -1;
    const stats = document.getElementById('search-stats');
    if (stats) stats.textContent = '';
    this.editor.setStatus('Search cleared');
    this.editor.state.searchResults = [];
    this.editor.finalizeUpdate();
    if (findInput) findInput.focus();
  }
  findNext() {
    const inputVal = document.getElementById('find-input').value;
    if (!inputVal) {
      this.reset();
      return;
    }
    const lineMatch = inputVal.match(/^:(\d+)$/);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1], 10);
      const targetRow = Math.max(0, Math.min(lineNum - 1, this.editor.state.lines.length - 1));
      this.editor.state.cursor = {
        row: targetRow,
        col: 0
      };
      this.editor.state.selectionAnchor = null;
      this.editor.state.desiredCol = 0;
      const lh = this.editor.config.lineHeight;
      const topPos = targetRow * lh;
      const anchor = document.createElement('div');
      anchor.style.position = 'absolute';
      anchor.style.top = topPos + 'px';
      anchor.style.height = lh + 'px';
      anchor.style.width = '1px';
      anchor.style.visibility = 'hidden';
      this.editor.dom.editor.appendChild(anchor);
      anchor.scrollIntoView({
        block: 'center',
        behavior: 'auto'
      });
      this.editor.state.scrollTop = this.editor.dom.editor.scrollTop;
      this.editor.dom.editor.removeChild(anchor);
      this.editor.finalizeUpdate();
      this.editor.setStatus(`Jumped to Ln ${lineNum}`);
      this.editor.dom.trap.focus();
      return;
    }
    if (inputVal !== this.lastQuery) this.find(inputVal);
    if (this.matches.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    const m = this.matches[this.currentIndex];
    document.getElementById('search-stats').textContent = `${this.currentIndex + 1} of ${this.matches.length}`;
    this.editor.state.selectionAnchor = {
      row: m.row,
      col: m.col
    };
    this.editor.state.cursor = {
      row: m.row,
      col: m.col + m.len
    };
    this.editor.state.desiredCol = m.col + m.len;
    const lh = this.editor.config.lineHeight;
    const targetRow = m.row;
    const paddingLines = 8;
    const desiredBottomPixel = (targetRow + paddingLines) * lh;
    let newScrollTop = desiredBottomPixel - this.editor.state.viewportHeight;
    newScrollTop = Math.max(0, newScrollTop);
    if (newScrollTop > targetRow * lh) {
      newScrollTop = targetRow * lh;
    }
    this.editor.dom.editor.scrollTop = newScrollTop;
    this.editor.state.scrollTop = newScrollTop;
    this.editor.finalizeUpdate();
  }
  replace() {
    if (this.matches.length === 0) return;
    const replacement = document.getElementById('replace-input').value;
    const m = this.matches[this.currentIndex];
    const cursor = this.editor.state.cursor;
    const anchor = this.editor.state.selectionAnchor;
    if (anchor && cursor.row === m.row && Math.abs(cursor.col - anchor.col) === m.len) {
      this.editor.applyChange(replacement);
      this.lastQuery = "";
      this.findNext();
    } else {
      this.findNext();
    }
  }
  replaceAll() {
    const query = document.getElementById('find-input').value;
    const replacement = document.getElementById('replace-input').value;
    if (!query) return;
    if (query.length === 0) return;
    if (!confirm(`Replace all occurrences of "${query}"?`)) return;
    const lines = this.editor.state.lines;
    let count = 0;
    const newLines = lines.map(line => {
      if (line.includes(query)) {
        const matchCount = line.split(query).length - 1;
        count += matchCount;
        return line.replaceAll(query, replacement);
      }
      return line;
    });
    if (count > 0) {
      const newText = newLines.join('\n');
      this.editor.applyEditInternal(0, 0, lines.length - 1, lines[lines.length - 1].length, newText, true);
      this.editor.setStatus(`Replaced ${count} occurrences`);
      this.matches = [];
      this.lastQuery = "";
      document.getElementById('search-stats').textContent = "";
    } else {
      this.editor.setStatus("Nothing found");
    }
  }
}
class EditorEngine {
  constructor() {
    this.config = {
      lineHeight: 24,
      charWidth: 9,
      xOffset: 65,
      viewBuffer: 15
    };
    this.state = {
      files: [{
        name: 'newfile.txt',
        lines: [""],
        isDirty: false,
        cursor: {
          row: 0,
          col: 0
        },
        fileSha: null,
        fileHandle: null
      }],
      activeFileIndex: 0,
      get lines() {
        return this.files[this.activeFileIndex].lines;
      },
      set lines(val) {
        this.files[this.activeFileIndex].lines = val;
      },
      get cursor() {
        return this.files[this.activeFileIndex].cursor;
      },
      set cursor(val) {
        this.files[this.activeFileIndex].cursor = val;
      },
      get isDirty() {
        return this.files[this.activeFileIndex].isDirty;
      },
      set isDirty(val) {
        this.files[this.activeFileIndex].isDirty = val;
      },
      get fileName() {
        return this.files[this.activeFileIndex].name;
      },
      set fileName(val) {
        this.files[this.activeFileIndex].name = val;
      },
      get fileSha() {
        return this.files[this.activeFileIndex].fileSha;
      },
      set fileSha(val) {
        this.files[this.activeFileIndex].fileSha = val;
      },
      get fileHandle() {
        return this.files[this.activeFileIndex].fileHandle;
      },
      set fileHandle(val) {
        this.files[this.activeFileIndex].fileHandle = val;
      },
      selectionAnchor: null,
      isDragging: false,
      scrollTop: 0,
      viewportHeight: 0
    };
    this.dom = {
      editor: document.getElementById('editor'),
      phantom: document.getElementById('scroll-phantom'),
      viewport: document.getElementById('view-port'),
      cursor: document.getElementById('cursor'),
      fileStatus: document.getElementById('file-status'),
      messageArea: document.getElementById('message-area')
    };
    this.history = new HistoryManager(this);
    this.search = new SearchManager(this);
    this.highlighter = new SyntaxHighlighter(this);
    this.ai = new GeminiBrain(this);
    this.github = new GitHubManager(this);
    this.imageGenerator = new ImageGeneratorManager(this);
    this.ticking = false;
    this.init();
  }
  init() {
    this.setupDragAndDrop();
    this.isComposing = false;
    this.dom.trap = document.createElement('textarea');
    this.dom.trap.id = 'input-trap';
    this.dom.trap.setAttribute('spellcheck', 'false');
    this.dom.trap.setAttribute('autocorrect', 'off');
    this.dom.trap.setAttribute('autocapitalize', 'off');
    this.dom.trap.setAttribute('autocomplete', 'off');
    this.dom.trap.value = ' ';
    this.dom.trap.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });
    this.dom.trap.addEventListener('compositionend', (e) => {
      this.isComposing = false;
      if (e.data) {
        this.applyChange(e.data);
        this.dom.trap.value = ' ';
      }
    });
    document.body.appendChild(this.dom.trap);
    const measureLine = document.createElement('div');
    measureLine.id = 'measure-line';
    document.body.appendChild(measureLine);
    this.dom.measureLine = measureLine;
    document.getElementById('find-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.search.findNext();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.dom.trap.focus();
      }
    });
    document.getElementById('replace-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search.replace();
      if (e.key === 'Escape') {
        e.preventDefault();
        this.dom.trap.focus();
      }
    });
    this.search.reset();
    this.state.viewportHeight = this.dom.editor.clientHeight;
    document.fonts.ready.then(() => this.recalculateLayout());
    this.dom.editor.addEventListener('scroll', () => this.onScroll());
    this.dom.editor.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.dom.trap.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.dom.trap.addEventListener('input', (e) => this.handleTrapInput(e));
    this.dom.trap.addEventListener('paste', (e) => this.handlePaste(e));
    this.dom.trap.addEventListener('copy', (e) => this.handleCopyCut(e, false));
    this.dom.trap.addEventListener('cut', (e) => this.handleCopyCut(e, true));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('resize', () => {
      this.state.viewportHeight = this.dom.editor.clientHeight;
      this.recalculateLayout();
    });
    document.addEventListener('keydown', (e) => this.handleGlobalShortcuts(e), true);
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.finalizeUpdate();
    this.dom.trap.focus();
  }
  renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;
    container.innerHTML = '';
    this.state.files.forEach((file, index) => {
      const tab = document.createElement('div');
      tab.className = `tab ${index === this.state.activeFileIndex ? 'active' : ''}`;
      if (file.isDirty) tab.classList.add('dirty');
      const name = file.name.toLowerCase();
      let typeColor = '#ff5555';
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        typeColor = '#569cd6';
      } else if (name.endsWith('.css')) {
        typeColor = '#d7ba7d';
      } else if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.json') || name.endsWith('.ts')) {
        typeColor = '#c586c0';
      } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        typeColor = '#d4d4d4';
      }
      tab.style.borderTop = `2px solid ${typeColor}`;
      tab.style.color = typeColor;
      tab.style.paddingTop = '0px';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = file.name;
      tab.appendChild(nameSpan);
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '✕';
      closeBtn.style.color = 'inherit';
      closeBtn.style.opacity = '0.7';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeTab(index);
      };
      tab.appendChild(closeBtn);
      tab.onclick = () => this.switchTab(index);
      container.appendChild(tab);
    });
  }
  switchTab(index) {
    if (index === this.state.activeFileIndex) return;
    this.state.files[this.state.activeFileIndex].cursor = {
      ...this.state.cursor
    };
    this.state.activeFileIndex = index;
    const activeFile = this.state.files[index];
    this.state.fileName = activeFile.name;
    const currentPath = activeFile.fullPath || activeFile.name;
    if (this.github) {
      this.github.settings.filePath = currentPath;
      if (this.github.filePathInput) {
        this.github.filePathInput.value = currentPath;
      }
    }
    if (activeFile.cursor) {
      this.state.cursor = {
        ...activeFile.cursor
      };
    } else {
      this.state.cursor = {
        row: 0,
        col: 0
      };
    }
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.renderTabs();
    this.finalizeUpdate();
    this.setStatus(`Switched to ${activeFile.name}`);
    this.dom.trap.focus({
      preventScroll: true
    });
  }
  closeTab(index) {
    if (this.state.files.length <= 1) {
      this.setStatus("Cannot close the last tab");
      return;
    }
    const fileToClose = this.state.files[index];
    if (fileToClose.isDirty) {
      const discard = confirm(`You have unsaved changes in "${fileToClose.name}".\n\nClose anyway and discard changes?`);
      if (!discard) {
        return;
      }
    }
    this.state.files.splice(index, 1);
    if (this.state.activeFileIndex >= index) {
      this.state.activeFileIndex = Math.max(0, this.state.activeFileIndex - 1);
    }
    const activeFile = this.state.files[this.state.activeFileIndex];
    this.state.fileName = activeFile.name;
    if (activeFile.cursor) {
      this.state.cursor = {
        ...activeFile.cursor
      };
    } else {
      this.state.cursor = {
        row: 0,
        col: 0
      };
    }
    if (this.github) {
      this.github.settings.filePath = activeFile.name;
    }
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.renderTabs();
    this.finalizeUpdate();
  }
  addNewTab() {
    const newFile = {
      name: `file-${this.state.files.length + 1}.js`,
      lines: [""],
      isDirty: false,
      cursor: {
        row: 0,
        col: 0
      },
      fileSha: null,
      fileHandle: null
    };
    this.state.files.push(newFile);
    this.switchTab(this.state.files.length - 1);
  }
  showLoading(msg = "Thinking...") {
    const toast = document.getElementById('ai-loading-toast');
    const txt = document.getElementById('ai-loading-msg');
    if (toast && txt) {
      txt.textContent = msg;
      toast.style.display = 'block';
    }
  }
  hideLoading() {
    const toast = document.getElementById('ai-loading-toast');
    if (toast) toast.style.display = 'none';
    this.dom.trap.focus();
  }
  measureTextWidth(text) {
    let content = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([\uD800-\uDBFF][\uDC00-\uDFFF](?:\u200D[\uD800-\uDBFF][\uDC00-\uDFFF])*)/g, '<span class="token emoji">$1</span>');
    this.dom.measureLine.innerHTML = content;
    return this.dom.measureLine.getBoundingClientRect().width;
  }
  smartUnindent() {
    const {
      cursor: c,
      selectionAnchor: s,
      lines
    } = this.state;
    let sr = s ? Math.min(s.row, c.row) : c.row;
    let er = s ? Math.max(s.row, c.row) : c.row;
    const newLines = [];
    let changed = false;
    for (let i = 0; i <= er; i++) {
      let line = lines[i];
      if (i >= sr) {
        const state = this.highlighter.lineState[i];
        const isProtected = state !== null && state !== undefined;
        if (!isProtected) {
          const unindented = line.replace(/^(\t| {1,2})/, "");
          if (line !== unindented) changed = true;
          newLines.push(unindented);
        } else {
          newLines.push(line);
        }
      }
    }
    if (changed) {
      const newBlockText = newLines.join('\n');
      const txt = newLines.join('\n');
      this.applyEditInternal(sr, 0, er, lines[er].length, txt, true);
      this.state.selectionAnchor = {
        row: sr,
        col: 0
      };
      this.state.cursor = {
        row: er,
        col: newLines[newLines.length - 1].length
      };
      this.finalizeUpdate();
    }
  }
  handleBackspace(wordMode = false) {
    const {
      cursor: c,
      lines,
      selectionAnchor
    } = this.state;
    if (selectionAnchor) {
      this.applyChange("");
      return;
    }
    if (c.col > 0) {
      if (!wordMode) {
        let deleteCount = 1;
        const line = lines[c.row];
        if (c.col >= 2) {
          const high = line.charCodeAt(c.col - 2);
          const low = line.charCodeAt(c.col - 1);
          if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
            deleteCount = 2;
            let ptr = c.col - 2;
            while (ptr >= 3) {
              if (line.charCodeAt(ptr - 1) === 0x200D) {
                const h2 = line.charCodeAt(ptr - 3);
                const l2 = line.charCodeAt(ptr - 2);
                if (h2 >= 0xD800 && h2 <= 0xDBFF && l2 >= 0xDC00 && l2 <= 0xDFFF) {
                  deleteCount += 3;
                  ptr -= 3;
                  continue;
                }
              }
              break;
            }
          }
        }
        this.state.selectionAnchor = {
          row: c.row,
          col: c.col - deleteCount
        };
        this.applyChange("");
      } else {
        const boundary = this.findWordBoundary(c.row, c.col, -1);
        this.state.selectionAnchor = {
          row: c.row,
          col: boundary
        };
        this.applyChange("");
      }
    } else if (c.row > 0) {
      const prevLineLen = lines[c.row - 1].length;
      this.applyEditInternal(c.row - 1, prevLineLen, c.row, 0, "", true);
      this.state.cursor = {
        row: c.row - 1,
        col: prevLineLen
      };
      this.finalizeUpdate();
    }
  }
  handleDelete() {
    const {
      cursor: c,
      lines,
      selectionAnchor
    } = this.state;
    if (selectionAnchor) {
      this.applyChange("");
    } else if (c.col < lines[c.row].length) {
      let deleteCount = 1;
      const line = lines[c.row];
      const high = line.charCodeAt(c.col);
      const low = line.charCodeAt(c.col + 1);
      if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
        deleteCount = 2;
        let ptr = c.col + 2;
        while (ptr < line.length) {
          if (line.charCodeAt(ptr) === 0x200D) {
            const h2 = line.charCodeAt(ptr + 1);
            const l2 = line.charCodeAt(ptr + 2);
            if (h2 >= 0xD800 && h2 <= 0xDBFF && l2 >= 0xDC00 && l2 <= 0xDFFF) {
              deleteCount += 3;
              ptr += 3;
              continue;
            }
          }
          break;
        }
      }
      this.state.selectionAnchor = {
        row: c.row,
        col: c.col + deleteCount
      };
      const oldC = {
        ...c
      };
      this.applyChange("");
      this.state.cursor = oldC;
      this.finalizeUpdate();
    } else if (c.row < lines.length - 1) {
      this.state.selectionAnchor = {
        row: c.row + 1,
        col: 0
      };
      const oldC = {
        ...c
      };
      this.applyChange("");
      this.state.cursor = oldC;
      this.finalizeUpdate();
    }
  }
  handleTrapInput(e) {
    if (this.isComposing) return;
    const val = this.dom.trap.value;
    if (val.length > 1) {
      const char = val.slice(1);
      this.applyChange(char);
    } else if (val.length === 0) {
      this.handleBackspace();
    }
    this.dom.trap.value = ' ';
  }
  validateCursorPosition() {
    const {
      row,
      col
    } = this.state.cursor;
    const line = this.state.lines[row];
    if (!line) return;
    if (col > 0 && col < line.length) {
      const high = line.charCodeAt(col - 1);
      const low = line.charCodeAt(col);
      if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
        this.state.cursor.col += 1;
        this.state.desiredCol = this.state.cursor.col;
      }
    }
  }
  preserveCursorPosition(action) {
    const savedRow = this.state.cursor.row;
    const savedCol = this.state.cursor.col;
    const savedScroll = this.state.scrollTop;
    action();
    const maxRow = this.state.lines.length - 1;
    const targetRow = Math.min(savedRow, maxRow);
    const maxCol = this.state.lines[targetRow].length;
    const targetCol = Math.min(savedCol, maxCol);
    this.state.cursor = {
      row: targetRow,
      col: targetCol
    };
    this.state.selectionAnchor = null;
    this.state.desiredCol = targetCol;
    const maxScroll = (this.state.lines.length * this.config.lineHeight) - this.state.viewportHeight;
    const safeScroll = Math.max(0, Math.min(savedScroll, maxScroll));
    this.dom.editor.scrollTop = safeScroll;
    this.state.scrollTop = safeScroll;
    this.finalizeUpdate();
  }
  removeEmptyLines() {
    this.preserveCursorPosition(() => {
      const lines = this.state.lines;
      const newLines = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const content = line.trim();
        const state = this.highlighter.lineState[i];
        const isProtected = state !== null && state !== undefined;
        if (content.length > 0 || isProtected) {
          newLines.push(line);
        }
      }
      const newText = newLines.join('\n');
      if (newText !== lines.join('\n')) {
        this.applyEditInternal(0, 0, lines.length - 1, lines[lines.length - 1].length, newText, true);
        this.setStatus("Empty lines removed");
      } else {
        this.setStatus("No empty lines found");
      }
    });
  }
  autoIndent() {
    if (typeof html_beautify === 'undefined') {
      this.setStatus("Formatter library not loaded.");
      return;
    }
    this.preserveCursorPosition(() => {
      const currentText = this.state.lines.join('\n');
      const fileName = this.state.fileName.toLowerCase();
      let formattedText = '';
      const options = {
        indent_size: 2,
        indent_char: ' ',
        preserve_newlines: true,
        max_preserve_newlines: 2,
        brace_style: "collapse"
      };
      try {
        if (fileName.endsWith('.js') || fileName.endsWith('.json')) {
          formattedText = js_beautify(currentText, options);
        } else if (fileName.endsWith('.css')) {
          formattedText = css_beautify(currentText, options);
        } else {
          formattedText = html_beautify(currentText, {
            ...options,
            indent_inner_html: true,
            extra_liners: []
          });
        }
        if (currentText !== formattedText) {
          this.applyEditInternal(0, 0, this.state.lines.length - 1,
            this.state.lines[this.state.lines.length - 1].length, formattedText, true);
          this.setStatus("Beautified ✨");
        }
      } catch (e) {
        this.setStatus("Format error: " + e.message);
      }
    });
  }
  removeComments() {
    this.preserveCursorPosition(() => {
      const lines = this.state.lines;
      const newLines = [];
      const fileName = this.state.fileName.toLowerCase();
      const isHtml = fileName.endsWith('.html') || fileName.endsWith('.htm');
      const isJs = fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.json') || fileName.endsWith('.ts');
      const isCss = fileName.endsWith('.css');
      let state = {
        inScript: isJs,
        inStyle: isCss,
        inBacktick: false,
        inBlockComm: false,
        inHtmlComm: false
      };
      let lastRealChar = '';
      let lastWord = '';
      let currentWord = '';
      const isEscaped = (lineStr, idx) => {
        let count = 0;
        let i = idx - 1;
        while (i >= 0 && lineStr[i] === '\\') {
          count++;
          i--;
        }
        return count % 2 !== 0;
      };
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();
        let builtLine = "";
        if (isHtml && !state.inBacktick && !state.inBlockComm && !state.inHtmlComm) {
          if (lowerLine.includes('<' + 'script')) {
            state.inScript = true;
            lastRealChar = '{';
          }
          if (lowerLine.includes('<' + 'style')) {
            state.inStyle = true;
          }
        }
        let inString = false;
        let quoteChar = '';
        let inRegex = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          const nextChar = line[j + 1];
          if (state.inScript && !state.inBacktick && !state.inBlockComm && !state.inHtmlComm && !inString && !inRegex) {
            if (/[a-zA-Z0-9_$]/.test(char)) {
              currentWord += char;
            } else {
              if (currentWord.length > 0) lastWord = currentWord;
              currentWord = '';
              if (char.trim() !== '') lastRealChar = char;
            }
          }
          if (state.inHtmlComm) {
            if (char === '-' && nextChar === '-' && line[j + 2] === '>') {
              state.inHtmlComm = false;
              j += 2;
            }
            continue;
          }
          if (state.inBlockComm) {
            if (char === '*' && nextChar === '/') {
              state.inBlockComm = false;
              j++;
            }
            continue;
          }
          if (state.inBacktick) {
            builtLine += char;
            if (char === '`' && !isEscaped(line, j)) state.inBacktick = false;
            continue;
          }
          if (inString) {
            builtLine += char;
            if (char === quoteChar && !isEscaped(line, j)) inString = false;
            continue;
          }
          if (inRegex) {
            builtLine += char;
            if (char === '/' && !isEscaped(line, j)) inRegex = false;
            continue;
          }
          if (!state.inScript && !state.inStyle && char === '<' && nextChar === '!' && line.substr(j, 4) === '<' + '!--') {
            state.inHtmlComm = true;
            j += 3;
            continue;
          }
          if ((state.inScript || state.inStyle) && char === '/' && nextChar === '*') {
            state.inBlockComm = true;
            j++;
            continue;
          }
          if (state.inScript && char === '/' && nextChar === '/') {
            break;
          }
          if (state.inScript || state.inStyle) {
            if (char === '`' && !isEscaped(line, j)) {
              state.inBacktick = true;
              builtLine += char;
              continue;
            }
            if ((char === '"' || char === "'") && !isEscaped(line, j)) {
              inString = true;
              quoteChar = char;
              builtLine += char;
              continue;
            }
            if (state.inScript && char === '/' && !isEscaped(line, j)) {
              if (nextChar !== '/' && nextChar !== '*') {
                if ("/=,:[({!&|?;+-*~^%".includes(lastRealChar) || ['return', 'case', 'throw', 'typeof', 'void', 'delete', 'await'].includes(lastWord)) {
                  inRegex = true;
                  builtLine += char;
                  continue;
                }
              }
            }
          }
          builtLine += char;
        }
        if (isHtml && !state.inBacktick && !state.inBlockComm && !state.inHtmlComm) {
          if (lowerLine.includes('<' + '/script>')) {
            state.inScript = false;
            lastRealChar = '';
          }
          if (lowerLine.includes('<' + '/style>')) state.inStyle = false;
        }
        newLines.push(builtLine);
      }
      const newText = newLines.join('\n');
      this.applyEditInternal(0, 0, lines.length - 1, lines[lines.length - 1].length, newText, true);
      this.setStatus(newText !== lines.join('\n') ? "Comments removed" : "No comments found");
    });
  }
  removeTrailingWhitespace() {
    this.preserveCursorPosition(() => {
      const lines = this.state.lines;
      const newLines = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const state = this.highlighter.lineState[i];
        const isProtected = state !== null && state !== undefined;
        if (isProtected) {
          newLines.push(line);
        } else {
          newLines.push(line.trimEnd());
        }
      }
      const newText = newLines.join('\n');
      if (newText !== lines.join('\n')) {
        this.applyEditInternal(0, 0, lines.length - 1, lines[lines.length - 1].length, newText, true);
        this.setStatus("Trailing whitespace removed");
      } else {
        this.setStatus("No trailing whitespace");
      }
    });
  }
  cycleNext(type) {
    const lines = this.state.lines;
    const cursor = this.state.cursor;
    let state = {
      inScript: false,
      inStyle: false,
      inBacktick: false,
      inBlockComm: false,
      inHtmlComm: false
    };
    let lastRealChar = '';
    let lastWord = '';
    let currentWord = '';
    let firstMatch = null;
    let nextMatch = null;
    const isEscaped = (lineStr, idx) => {
      let count = 0;
      let i = idx - 1;
      while (i >= 0 && lineStr[i] === '\\') {
        count++;
        i--;
      }
      return count % 2 !== 0;
    };
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r];
      const lowerLine = line.toLowerCase();
      if (!state.inBacktick && !state.inBlockComm && !state.inHtmlComm) {
        if (lowerLine.includes('\x3Cscript')) {
          state.inScript = true;
          lastRealChar = '{';
        }
        if (lowerLine.includes('\x3Cstyle')) {
          state.inStyle = true;
        }
      }
      if (type === 'function' && state.inScript && !state.inBacktick && !state.inBlockComm) {
        const fnRegex = /(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w+|^\s*(?:static\s+|async\s+|get\s+|set\s+)?(?!if|for|while|switch|catch|return|await)\w+\s*\(.*?\)\s*\{/;
        const m = line.match(fnRegex);
        if (m) {
          const match = {
            start: {
              r,
              c: m.index
            },
            end: {
              r,
              c: m.index
            },
            select: false
          };
          if (!firstMatch) firstMatch = match;
          if (r > cursor.row || (r === cursor.row && m.index > cursor.col)) {
            nextMatch = match;
            break;
          }
        }
      } else if (type === 'comment') {
        let inString = false;
        let quoteChar = '';
        let inRegex = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          if (state.inScript && !state.inBacktick && !state.inBlockComm && !state.inHtmlComm && !inString && !inRegex) {
            if (/[a-zA-Z0-9_$]/.test(char)) {
              currentWord += char;
            } else {
              if (currentWord.length > 0) lastWord = currentWord;
              currentWord = '';
              if (char.trim() !== '') lastRealChar = char;
            }
          }
          if (state.inHtmlComm) {
            if (char === '-' && nextChar === '-' && line[i + 2] === '>') {
              state.inHtmlComm = false;
              i += 2;
            }
            continue;
          }
          if (state.inBlockComm) {
            if (char === '*' && nextChar === '/') {
              state.inBlockComm = false;
              i++;
            }
            continue;
          }
          if (state.inBacktick) {
            if (char === '`' && !isEscaped(line, i)) state.inBacktick = false;
            continue;
          }
          if (inString) {
            if (char === quoteChar && !isEscaped(line, i)) inString = false;
            continue;
          }
          if (inRegex) {
            if (char === '/' && !isEscaped(line, i)) inRegex = false;
            continue;
          }
          if (!state.inScript && !state.inStyle && char === '<' && nextChar === '!' && line.substr(i, 4) === '\x3C!--') {
            const match = {
              start: {
                r,
                c: i
              },
              end: {
                r,
                c: i + 4
              },
              select: true
            };
            state.inHtmlComm = true;
            i += 3;
            if (!firstMatch) firstMatch = match;
            if (r > cursor.row || (r === cursor.row && i > cursor.col)) {
              nextMatch = match;
              break;
            }
            continue;
          }
          if (state.inScript || state.inStyle) {
            if (char === '`' && !isEscaped(line, i)) {
              state.inBacktick = true;
              continue;
            }
            if ((char === '"' || char === "'") && !isEscaped(line, i)) {
              inString = true;
              quoteChar = char;
              continue;
            }
            if (state.inScript && char === '/' && !isEscaped(line, i)) {
              if (nextChar !== '/' && nextChar !== '*') {
                if ("/=,:[({!&|?;+-*~^%".includes(lastRealChar) || ['return', 'case', 'throw', 'typeof', 'void', 'delete', 'await'].includes(lastWord)) {
                  inRegex = true;
                  continue;
                }
              }
            }
          }
          if ((state.inScript || state.inStyle) && char === '/' && nextChar === '*') {
            const match = {
              start: {
                r,
                c: i
              },
              end: {
                r,
                c: i + 2
              },
              select: true
            };
            state.inBlockComm = true;
            i++;
            if (!firstMatch) firstMatch = match;
            if (r > cursor.row || (r === cursor.row && i > cursor.col)) {
              nextMatch = match;
              break;
            }
            continue;
          }
          if (state.inScript && char === '/' && nextChar === '/') {
            const match = {
              start: {
                r,
                c: i
              },
              end: {
                r,
                c: line.length
              },
              select: true
            };
            if (!firstMatch) firstMatch = match;
            if (r > cursor.row || (r === cursor.row && i > cursor.col)) {
              nextMatch = match;
            }
            break;
          }
        }
      }
      if (nextMatch) break;
      if (!state.inBacktick && !state.inBlockComm && !state.inHtmlComm) {
        if (lowerLine.includes('\x3C/script>')) {
          state.inScript = false;
          lastRealChar = '';
        }
        if (lowerLine.includes('\x3C/style>')) state.inStyle = false;
      }
    }
    const found = nextMatch || firstMatch;
    if (found) {
      if (found.select) {
        this.state.selectionAnchor = {
          row: found.start.r,
          col: found.start.c
        };
        this.state.cursor = {
          row: found.end.r,
          col: found.end.c
        };
      } else {
        this.state.selectionAnchor = null;
        this.state.cursor = {
          row: found.start.r,
          col: found.start.c
        };
      }
      this.state.desiredCol = this.state.cursor.col;
      const lh = this.config.lineHeight;
      const targetRow = this.state.cursor.row;
      const desiredBottomPixel = (targetRow + 9) * lh;
      let newScrollTop = desiredBottomPixel - this.state.viewportHeight;
      newScrollTop = Math.max(0, newScrollTop);
      if (newScrollTop > targetRow * lh) newScrollTop = targetRow * lh;
      this.dom.editor.scrollTop = newScrollTop;
      this.finalizeUpdate();
      this.setStatus(`Found ${type}`);
    } else {
      this.setStatus(`No ${type} found`);
    }
    this.dom.trap.focus({
      preventScroll: true
    });
  }
  render() {
    const {
      lines,
      scrollTop,
      viewportHeight,
      cursor,
      selectionAnchor
    } = this.state;
    const {
      lineHeight,
      charWidth,
      xOffset,
      viewBuffer
    } = this.config;
    const firstVisibleLine = Math.floor(scrollTop / lineHeight);
    const startIndex = Math.max(0, firstVisibleLine - viewBuffer);
    const visibleLinesCount = Math.ceil(viewportHeight / lineHeight);
    const endIndex = Math.min(lines.length, firstVisibleLine + visibleLinesCount + viewBuffer);
    this.dom.viewport.innerHTML = '';
    const topOffset = startIndex * lineHeight;
    this.dom.viewport.style.transform = `translateY(${topOffset}px)`;
    let selStart = null,
      selEnd = null;
    if (selectionAnchor) {
      const anchorIsBefore = (selectionAnchor.row < cursor.row) ||
        (selectionAnchor.row === cursor.row && selectionAnchor.col < cursor.col);
      selStart = anchorIsBefore ? selectionAnchor : cursor;
      selEnd = anchorIsBefore ? cursor : selectionAnchor;
      if (selStart.row === selEnd.row && selStart.col === selEnd.col) selStart = null;
    }
    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'line';
      if (i === this.state.cursor.row) {
        const bg = document.createElement('div');
        bg.className = 'line-background';
        lineDiv.appendChild(bg);
      }
      const numSpan = document.createElement('div');
      numSpan.className = 'line-number';
      numSpan.textContent = i + 1;
      if (i === this.state.cursor.row) {
        numSpan.classList.add('active-line');
      }
      const contentSpan = document.createElement('div');
      contentSpan.className = 'line-content';
      contentSpan.innerHTML = this.highlighter.highlight(lines[i], i);
      const selectionDiv = document.createElement('div');
      selectionDiv.className = 'selection-layer';
      if (selStart && i >= selStart.row && i <= selEnd.row) {
        let colStart = 0;
        let colEnd = lines[i].length;
        if (i === selStart.row) colStart = selStart.col;
        if (i === selEnd.row) colEnd = selEnd.col;
        const getGridWidth = (str) => {
          let w = 0;
          for (let k = 0; k < str.length; k++) {
            if (this.isSurrogatePair(str, k)) {
              w += charWidth * 2;
              k++;
            } else {
              w += charWidth;
            }
          }
          return w;
        };
        const textBefore = lines[i].substring(0, colStart);
        const startPixel = Math.ceil(getGridWidth(textBefore));
        const textSel = lines[i].substring(colStart, colEnd);
        const selWidth = Math.round(getGridWidth(textSel));
        let finalWidth = selWidth;
        if (i < selEnd.row) finalWidth += Math.round(charWidth * 0.5);
        selectionDiv.style.left = `calc(${xOffset}px + ${startPixel}px)`;
        selectionDiv.style.width = `${Math.max(0, finalWidth)}px`;
        selectionDiv.classList.add('is-selected');
      }
      lineDiv.appendChild(numSpan);
      lineDiv.appendChild(selectionDiv);
      lineDiv.appendChild(contentSpan);
      fragment.appendChild(lineDiv);
    }
    this.dom.viewport.appendChild(fragment);
    this.updateCursor();
  }
  updateCursor() {
    const {
      row,
      col
    } = this.state.cursor;
    const {
      lineHeight,
      xOffset,
      charWidth
    } = this.config;
    const top = row * lineHeight;
    let left = 0;
    const currentLine = this.state.lines[row] || "";
    if (currentLine.length > 3000) {
      left = xOffset + (col * charWidth);
    } else {
      let textUpToCursor = currentLine.substring(0, col);
      textUpToCursor = textUpToCursor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      textUpToCursor = textUpToCursor.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF](?:\u200D[\uD800-\uDBFF][\uDC00-\uDFFF])*)/g, '<span class="token emoji">$1</span>');
      this.dom.measureLine.innerHTML = textUpToCursor;
      const measuredWidth = this.dom.measureLine.getBoundingClientRect().width;
      left = xOffset + measuredWidth;
    }
    this.dom.cursor.style.top = `${top}px`;
    this.dom.cursor.style.left = `${left}px`;
    this.dom.cursor.classList.remove('blink');
    clearTimeout(this.blinkTimeout);
    this.blinkTimeout = setTimeout(() => this.dom.cursor.classList.add('blink'), 500);
    this.dom.trap.style.top = `${top}px`;
    this.dom.trap.style.left = `${left}px`;
    const active = document.activeElement;
    const isExternalInput = active.tagName === 'INPUT' || active.tagName === 'SELECT' || (active.tagName === 'TEXTAREA' && active !== this.dom.trap);
    if (!isExternalInput) {
      this.dom.trap.focus({
        preventScroll: true
      });
    }
    const posDisplay = document.getElementById('cursor-pos');
    if (posDisplay) {
      posDisplay.textContent = `Ln ${row + 1}, Col ${col + 1}`;
    }
  }
  updateDimensions() {
    const {
      lines
    } = this.state;
    const {
      lineHeight,
      charWidth,
      xOffset
    } = this.config;
    const height = (lines.length + 5) * lineHeight;
    const maxLen = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const width = xOffset + ((maxLen + 5) * charWidth);
    this.dom.phantom.style.height = `${height}px`;
    this.dom.phantom.style.width = `${width}px`;
    this.dom.viewport.style.width = `${width}px`;
  }
  finalizeUpdate() {
    this.validateCursorPosition();
    this.updateDimensions();
    this.ensureCursorVisible();
    this.render();
    this.renderTabs();
  }
  recalculateLayout() {
    const t = document.createElement('div');
    t.className = 'line';
    t.style.position = 'absolute';
    t.style.visibility = 'hidden';
    t.style.width = 'auto';
    t.style.padding = '0';
    t.textContent = 'M'.repeat(1000);
    this.dom.viewport.appendChild(t);
    const rect = t.getBoundingClientRect();
    const w = rect.width / 1000;
    const h = rect.height;
    this.dom.viewport.removeChild(t);
    let needsUpdate = false;
    if (w > 0 && Math.abs(this.config.charWidth - w) > 0.0001) {
      this.config.charWidth = w;
      document.documentElement.style.setProperty('--char-width', `${w}px`);
      needsUpdate = true;
    }
    if (h > 0 && Math.abs(this.config.lineHeight - h) > 0.0001) {
      this.config.lineHeight = h;
      document.documentElement.style.setProperty('--line-height', `${h}px`);
      needsUpdate = true;
    }
    if (needsUpdate) this.finalizeUpdate();
  }
  onScroll() {
    const currentLeft = this.dom.editor.scrollLeft;
    if (currentLeft > 0 && currentLeft < 6) {
      this.dom.editor.scrollLeft = 0;
      return;
    }
    this.state.scrollTop = this.dom.editor.scrollTop;
    if (!this.ticking) {
      window.requestAnimationFrame(() => {
        this.render();
        this.ticking = false;
      });
      this.ticking = true;
    }
  }
  applyChange(txt) {
    const {
      cursor,
      selectionAnchor
    } = this.state;
    let sr = cursor.row,
      sc = cursor.col;
    let er = cursor.row,
      ec = cursor.col;
    if (selectionAnchor) {
      const anchorIsBefore = (selectionAnchor.row < cursor.row) ||
        (selectionAnchor.row === cursor.row && selectionAnchor.col < cursor.col);
      sr = anchorIsBefore ? selectionAnchor.row : cursor.row;
      sc = anchorIsBefore ? selectionAnchor.col : cursor.col;
      er = anchorIsBefore ? cursor.row : selectionAnchor.row;
      ec = anchorIsBefore ? cursor.col : selectionAnchor.col;
    }
    this.state.selectionAnchor = null;
    this.applyEditInternal(sr, sc, er, ec, txt, true);
    this.state.desiredCol = this.state.cursor.col;
    this.ensureCursorVisible();
  }
  applyEditInternal(sr, sc, er, ec, txt, hist) {
    let l = this.state.lines;
    let old = "";
    const isFullReplace = (sr === 0 && er === l.length - 1 && sc === 0 && ec === l[er].length);
    if (isFullReplace) {
      old = l.join('\n');
    } else {
      if (sr === er) {
        old = l[sr].slice(sc, ec);
      } else {
        const oldLines = [l[sr].slice(sc)];
        for (let i = sr + 1; i < er; i++) {
          oldLines.push(l[i]);
        }
        oldLines.push(l[er].slice(0, ec));
        old = oldLines.join('\n');
      }
    }
    const prefix = l[sr].slice(0, sc);
    const suffix = l[er].slice(ec);
    const newSegs = txt.split('\n');
    newSegs[0] = prefix + newSegs[0];
    newSegs[newSegs.length - 1] += suffix;
    const linesToRemove = er - sr + 1;
    const MANUAL_RECONSTRUCTION_THRESHOLD_LINES = 10000;
    if (isFullReplace || newSegs.length >= MANUAL_RECONSTRUCTION_THRESHOLD_LINES || linesToRemove >= MANUAL_RECONSTRUCTION_THRESHOLD_LINES) {
      const newLinesArray = [];
      for (let i = 0; i < sr; i++) {
        newLinesArray.push(l[i]);
      }
      for (let i = 0; i < newSegs.length; i++) {
        newLinesArray.push(newSegs[i]);
      }
      for (let i = er + 1; i < l.length; i++) {
        newLinesArray.push(l[i]);
      }
      this.state.lines = newLinesArray;
    } else {
      l.splice(sr, linesToRemove, ...newSegs);
    }
    const nr = sr + newSegs.length - 1;
    const nc = (newSegs.length === 1 ? sc : 0) + txt.split('\n').pop().length;
    if (hist) {
      this.history.record({
        startRow: sr,
        startCol: sc,
        endRow: er,
        endCol: ec,
        text: txt,
        oldText: old,
        cursorBefore: {
          row: sr,
          col: sc
        },
        cursorAfter: {
          row: nr,
          col: nc
        }
      });
      this.state.isDirty = true;
    }
    this.search.lastQuery = "";
    this.search.matches = [];
    document.getElementById('search-stats').textContent = "";
    this.state.cursor = {
      row: nr,
      col: nc
    };
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.finalizeUpdate();
  }
  handleKeyDown(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const alt = e.altKey;
    const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (nav.includes(k)) {
      e.preventDefault();
      if (e.shiftKey && alt && k === 'ArrowDown') {
        const selectedText = this.getSelectionText();
        if (selectedText) {
          const s = this.state.selectionAnchor;
          const c = this.state.cursor;
          let endRow, endCol;
          if (c.row > s.row || (c.row === s.row && c.col > s.col)) {
            endRow = c.row;
            endCol = c.col;
          } else {
            endRow = s.row;
            endCol = s.col;
          }
          this.applyEditInternal(endRow, endCol, endRow, endCol, selectedText, true);
        } else {
          const {
            row
          } = this.state.cursor;
          const lineContent = this.state.lines[row];
          this.applyEditInternal(row, lineContent.length, row, lineContent.length, '\n' + lineContent, true);
          this.state.cursor.row++;
        }
        this.finalizeUpdate();
        return;
      }
      if (e.shiftKey) {
        if (!this.state.selectionAnchor) this.state.selectionAnchor = {
          ...this.state.cursor
        };
      } else {
        this.state.selectionAnchor = null;
      }
      this.handleNavigation(k, ctrl);
      this.render();
      return;
    }
    if (ctrl) {
      if (!['z', 'y', 'a'].includes(k.toLowerCase())) return;
      if (k.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this.history.redo() : this.history.undo();
        this.setStatus(e.shiftKey ? "Redo" : "Undo");
        return;
      }
      if (k.toLowerCase() === 'y') {
        e.preventDefault();
        this.history.redo();
        this.setStatus("Redo");
        return;
      }
      if (k.toLowerCase() === 'a') {
        e.preventDefault();
        this.state.selectionAnchor = {
          row: 0,
          col: 0
        };
        this.state.cursor = {
          row: this.state.lines.length - 1,
          col: this.state.lines[this.state.lines.length - 1].length
        };
        this.render();
        return;
      }
    }
    if (k === 'Enter') {
      e.preventDefault();
      const {
        cursor: c,
        lines
      } = this.state;
      const currentLine = lines[c.row];
      if (c.col > 0) {
        const indent = (currentLine.match(/^\s*/) || [''])[0];
        const textBeforeCursor = currentLine.substring(0, c.col);
        let extra = textBeforeCursor.trim().endsWith('{') ? "  " : "";
        this.applyChange("\n" + indent + extra);
      } else {
        this.applyChange("\n");
      }
      return;
    }
    if (k === 'Tab') {
      e.preventDefault();
      const indent = "  ";
      const {
        selectionAnchor,
        cursor
      } = this.state;
      if (selectionAnchor && (selectionAnchor.row !== cursor.row || selectionAnchor.col !== cursor.col)) {
        if (e.shiftKey) {
          this.smartUnindent();
        } else {
          this.blockEdit(l => indent + l);
        }
      } else {
        if (e.shiftKey) {
          this.smartUnindent();
        } else {
          this.applyChange(indent);
        }
      }
      return;
    }
    if (k === 'Backspace') {
      if (ctrl) {
        e.preventDefault();
        this.handleBackspace(true);
      } else {
        e.preventDefault();
        this.handleBackspace();
      }
      return;
    }
    if (k === 'Delete') {
      e.preventDefault();
      this.handleDelete();
      return;
    }
    const pairs = {
      '(': ')',
      '{': '}',
      '[': ']',
      '"': '"',
      "'": "'",
      '`': '`'
    };
    if (pairs[k] && !ctrl && !alt && k.length === 1) {
      e.preventDefault();
      const {
        cursor,
        lines
      } = this.state;
      const line = lines[cursor.row];
      const nextChar = line[cursor.col];
      if (nextChar === k && (k === '"' || k === "'" || k === '`' || k === ')' || k === '}' || k === ']')) {
        this.state.cursor.col++;
        this.state.desiredCol = this.state.cursor.col;
        this.finalizeUpdate();
        return;
      }
      this.applyChange(k + pairs[k]);
      this.state.cursor.col -= 1;
      this.state.desiredCol = this.state.cursor.col;
      this.finalizeUpdate();
    }
  }
  handleNavigation(k, wordJump) {
    const {
      cursor: c,
      lines: l
    } = this.state;
    let tr = c.row,
      tc = c.col;
    const lineText = l[tr];
    if (k === 'ArrowUp') {
      if (tr > 0) tr--;
      tc = Math.min(this.state.desiredCol, l[tr].length);
    } else if (k === 'ArrowDown') {
      if (tr < l.length - 1) tr++;
      tc = Math.min(this.state.desiredCol, l[tr].length);
    } else if (k === 'ArrowLeft') {
      if (wordJump) {
        tc = this.findWordBoundary(tr, tc, -1);
      } else if (tc > 0) {
        tc--;
        if (tc > 0) {
          const high = lineText.charCodeAt(tc - 1);
          const low = lineText.charCodeAt(tc);
          if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
            tc--;
          }
        }
      } else if (tr > 0) {
        tr--;
        tc = l[tr].length;
      }
      this.state.desiredCol = tc;
    } else if (k === 'ArrowRight') {
      if (wordJump) {
        tc = this.findWordBoundary(tr, tc, 1);
      } else if (tc < lineText.length) {
        tc++;
        if (tc < lineText.length) {
          const high = lineText.charCodeAt(tc - 1);
          const low = lineText.charCodeAt(tc);
          if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
            tc++;
          }
        }
      } else if (tr < l.length - 1) {
        tr++;
        tc = 0;
      }
      this.state.desiredCol = tc;
    } else if (k === 'Home') {
      const fc = (l[tr].match(/^\s*/) || [''])[0].length;
      tc = (tc === fc) ? 0 : fc;
      this.state.desiredCol = tc;
    } else if (k === 'End') {
      tc = l[tr].length;
      this.state.desiredCol = tc;
    } else if (k === 'PageUp') {
      tr = Math.max(0, tr - Math.floor(this.state.viewportHeight / this.config.lineHeight));
      tc = Math.min(tc, l[tr].length);
    } else if (k === 'PageDown') {
      tr = Math.min(l.length - 1, tr + Math.floor(this.state.viewportHeight / this.config.lineHeight));
      tc = Math.min(tc, l[tr].length);
    }
    c.row = tr;
    c.col = tc;
    this.ensureCursorVisible();
  }
  findWordBoundary(r, c, direction) {
    const line = this.state.lines[r];
    const len = line.length;
    let i = c;
    const isWordPart = (char) => /[\w\d_$æøåÆØÅ]/.test(char);
    if (direction === 1) {
      if (i >= len) return len;
      if (isWordPart(line[i])) {
        while (i < len && isWordPart(line[i])) i++;
      } else if (!/\s/.test(line[i])) {
        while (i < len && !isWordPart(line[i]) && !/\s/.test(line[i])) i++;
      }
      while (i < len && /\s/.test(line[i])) i++;
      return i;
    } else {
      if (i <= 0) return 0;
      i--;
      while (i > 0 && /\s/.test(line[i])) i--;
      const hitWord = isWordPart(line[i]);
      if (hitWord) {
        while (i > 0 && isWordPart(line[i - 1])) i--;
      } else {
        while (i > 0 && !isWordPart(line[i - 1]) && !/\s/.test(line[i - 1])) i--;
      }
      return i;
    }
  }
  handleCopyCut(e, isCut) {
    const text = this.getSelectionText();
    if (text) {
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      if (isCut) {
        this.applyChange("");
        this.setStatus("Cut");
      } else {
        this.setStatus("Copied");
      }
    }
  }
  handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    if (this.state.lines.length <= 1 && this.state.lines[0] === "" &&
      (this.state.fileName === 'Untitled.txt' || this.state.fileName === 'newfile.txt')) {
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        this.state.fileName = 'index.html';
      } else if (text.includes('function') || text.includes('const ') || text.includes('let ')) {
        this.state.fileName = 'script.js';
      } else if (text.includes('{') && text.includes(':') && text.includes(';')) {
        if (!text.includes('<')) this.state.fileName = 'style.css';
      }
      const statusEl = document.getElementById('file-status');
      if (statusEl) statusEl.textContent = this.state.fileName;
    }
    this.applyChange(text);
    this.setStatus("Pasted and analyzed");
  }
  handleMouseDown(e) {
    if (e.target === this.dom.editor && e.offsetX > this.dom.editor.clientWidth) return;
    if (e.button === 2) return;
    e.preventDefault();
    const now = Date.now();
    this.state.clickCount = (now - this.state.lastClickTime < 300) ? this.state.clickCount + 1 : 1;
    this.state.lastClickTime = now;
    const p = this.getPosFromMouse(e);
    const lineText = this.state.lines[p.row];
    const rect = this.dom.editor.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < 60) {
      this.state.selectionAnchor = {
        row: p.row,
        col: 0
      };
      this.state.cursor = {
        row: p.row,
        col: lineText.length
      };
      this.state.isDragging = true;
      this.state.desiredCol = lineText.length;
      this.dom.trap.focus({
        preventScroll: true
      });
      this.render();
      return;
    }
    if (this.state.clickCount > 1) {
      this.state.isDragging = false;
      let startCol, endCol;
      if (this.state.clickCount === 2) {
        startCol = this.findWordBoundary(p.row, p.col, -1);
        endCol = this.findWordBoundary(p.row, p.col, 1);
        const stringMatch = lineText.match(/("|')(.*?)("|')/g);
        if (stringMatch) {
          let offset = 0;
          for (const match of stringMatch) {
            const sIdx = lineText.indexOf(match, offset);
            const eIdx = sIdx + match.length;
            if (p.col > sIdx && p.col < eIdx) {
              startCol = sIdx + 1;
              endCol = eIdx - 1;
              break;
            }
            offset = eIdx;
          }
        }
      } else {
        startCol = (lineText.match(/^\s*/) || [''])[0].length;
        endCol = lineText.length;
      }
      if (e.shiftKey && this.state.selectionAnchor) {
        this.state.cursor = {
          row: p.row,
          col: endCol
        };
      } else {
        this.state.selectionAnchor = {
          row: p.row,
          col: startCol
        };
        this.state.cursor = {
          row: p.row,
          col: endCol
        };
      }
      this.state.desiredCol = this.state.cursor.col;
      this.dom.trap.focus({
        preventScroll: true
      });
      this.render();
      return;
    }
    if (e.shiftKey) {
      if (!this.state.selectionAnchor) {
        this.state.selectionAnchor = {
          ...this.state.cursor
        };
      }
      this.state.cursor = {
        ...p
      };
    } else {
      this.state.selectionAnchor = {
        ...p
      };
      this.state.cursor = {
        ...p
      };
    }
    this.state.isDragging = true;
    this.state.desiredCol = p.col;
    this.dom.trap.focus({
      preventScroll: true
    });
    this.render();
  }
  handleContextMenu(e) {
    const text = this.getSelectionText();
    if (!text) return;
    if (this.contextMenuListener) {
      window.removeEventListener('mousedown', this.contextMenuListener);
      this.contextMenuListener = null;
    }
    const existingTrap = document.getElementById('context-trap');
    if (existingTrap) document.body.removeChild(existingTrap);
    const trap = document.createElement('textarea');
    trap.id = 'context-trap';
    trap.style.position = 'fixed';
    trap.style.width = '300px';
    trap.style.height = '150px';
    trap.style.left = (e.clientX - 150) + 'px';
    trap.style.top = (e.clientY - 75) + 'px';
    trap.style.opacity = '0.01';
    trap.style.zIndex = '99999';
    trap.value = text;
    document.body.appendChild(trap);
    trap.focus();
    trap.select();
    const cleanup = () => {
      if (trap.parentNode) trap.parentNode.removeChild(trap);
      if (this.contextMenuListener) {
        window.removeEventListener('mousedown', this.contextMenuListener);
        this.contextMenuListener = null;
      }
      this.dom.trap.focus({
        preventScroll: true
      });
    };
    this.contextMenuListener = (event) => {
      if (event.target === trap) return;
      cleanup();
    };
    setTimeout(() => {
      window.addEventListener('mousedown', this.contextMenuListener);
    }, 100);
    trap.addEventListener('input', () => {
      const newText = trap.value;
      if (newText === '') {
        this.applyChange('');
        this.setStatus("Cut");
      } else if (newText !== text) {
        this.applyChange(newText);
      }
    });
  }
  handleMouseMove(e) {
    if (!this.state.isDragging) return;
    const p = this.getPosFromMouse(e);
    this.state.cursor = {
      ...p
    };
    this.state.desiredCol = p.col;
    const rect = this.dom.editor.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const edgeMargin = 50;
    const isNearEdge = mouseX < edgeMargin || mouseX > rect.width - edgeMargin;
    if (isNearEdge) {
      this.ensureCursorVisible();
    } else {
      const {
        row
      } = this.state.cursor;
      const {
        lineHeight
      } = this.config;
      const top = row * lineHeight;
      const bottom = top + lineHeight;
      const vH = this.state.viewportHeight;
      const sT = this.dom.editor.scrollTop;
      if (top < sT) this.dom.editor.scrollTop = top;
      else if (bottom > sT + vH) this.dom.editor.scrollTop = bottom - vH;
    }
    this.render();
  }
  handleMouseUp(e) {
    this.state.isDragging = false;
    if (e && e.target && e.target.closest('#chat-sidebar')) {
      return;
    }
    const {
      cursor,
      selectionAnchor
    } = this.state;
    if (selectionAnchor && cursor.row === selectionAnchor.row && cursor.col === selectionAnchor.col) {
      this.state.selectionAnchor = null;
    }
    this.render();
  }
  getPosFromMouse(e) {
    const r = this.dom.editor.getBoundingClientRect();
    const x = e.clientX - r.left + this.dom.editor.scrollLeft;
    const y = e.clientY - r.top + this.dom.editor.scrollTop;
    let row = Math.floor(y / this.config.lineHeight);
    row = Math.max(0, Math.min(row, this.state.lines.length - 1));
    const line = this.state.lines[row];
    const targetPixel = x - this.config.xOffset;
    if (targetPixel <= 0) return {
      row,
      col: 0
    };
    if (line.length > 3000) {
      let col = Math.round(targetPixel / this.config.charWidth);
      return {
        row,
        col: Math.min(col, line.length)
      };
    }
    let col = Math.floor(targetPixel / this.config.charWidth);
    col = Math.min(col, line.length);
    if (col > 0 && this.isSurrogatePair(line, col - 1)) col--;
    let currentWidth = this.measureTextWidth(line.substring(0, col));
    if (currentWidth < targetPixel) {
      while (col < line.length) {
        const charLen = this.isSurrogatePair(line, col) ? 2 : 1;
        const nextWidth = this.measureTextWidth(line.substring(0, col + charLen));
        if (targetPixel < nextWidth) {
          const charMiddle = currentWidth + (nextWidth - currentWidth) / 2;
          if (targetPixel > charMiddle) {
            return {
              row,
              col: col + charLen
            };
          } else {
            return {
              row,
              col: col
            };
          }
        }
        currentWidth = nextWidth;
        col += charLen;
      }
    } else {
      while (col > 0) {
        const prevCharLen = (col - 2 >= 0 && this.isSurrogatePair(line, col - 2)) ? 2 : 1;
        const prevWidth = this.measureTextWidth(line.substring(0, col - prevCharLen));
        if (targetPixel > prevWidth) {
          const charMiddle = prevWidth + (currentWidth - prevWidth) / 2;
          if (targetPixel > charMiddle) {
            return {
              row,
              col: col
            };
          } else {
            return {
              row,
              col: col - prevCharLen
            };
          }
        }
        currentWidth = prevWidth;
        col -= prevCharLen;
      }
    }
    return {
      row,
      col
    };
  }
  isSurrogatePair(text, i) {
    if (i >= text.length - 1) return false;
    const high = text.charCodeAt(i);
    const low = text.charCodeAt(i + 1);
    return (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF);
  }
  ensureCursorVisible() {
    const {
      row,
      col
    } = this.state.cursor;
    const {
      lineHeight,
      charWidth,
      xOffset
    } = this.config;
    const bufferLines = 3;
    const bufferPixels = bufferLines * lineHeight;
    const top = row * lineHeight;
    const bottom = top + lineHeight;
    const vH = this.state.viewportHeight;
    const sT = this.dom.editor.scrollTop;
    if (top < sT + bufferPixels) {
      this.dom.editor.scrollTop = Math.max(0, top - bufferPixels);
    } else if (bottom > sT + vH - bufferPixels) {
      this.dom.editor.scrollTop = bottom - vH + bufferPixels;
    }
    const left = xOffset + (col * charWidth);
    const sL = this.dom.editor.scrollLeft;
    const cW = this.dom.editor.clientWidth;
    if (left < sL + xOffset) {
      this.dom.editor.scrollLeft = Math.max(0, left - xOffset - 20);
    } else if (left > sL + cW) {
      this.dom.editor.scrollLeft = left - cW + 20;
    }
  }
  blockEdit(mod, sr = null, er = null) {
    const {
      cursor: c,
      selectionAnchor: s,
      lines: l
    } = this.state;
    sr = sr ?? Math.min(c.row, s ? s.row : c.row);
    er = er ?? Math.max(c.row, s ? s.row : c.row);
    const orig = l.slice(sr, er + 1).join('\n');
    const modded = l.slice(sr, er + 1).map(mod).join('\n');
    if (orig !== modded) {
      this.applyEditInternal(sr, 0, er, l[er].length, modded, true);
      this.state.selectionAnchor = {
        row: sr,
        col: 0
      };
      this.state.cursor = {
        row: er,
        col: l[er].length
      };
      this.finalizeUpdate();
    }
  }
  async handleGlobalShortcuts(e) {
    if (!e.key) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const alt = e.altKey;
    if (ctrl) {
      if (k === 'o') {
        e.preventDefault();
        this.openFile();
        return;
      }
      if (k === 's') {
        e.preventDefault();
        this.saveFile();
        return;
      }
      if (k === 'n') {
        e.preventDefault();
        this.newFile();
        return;
      }
      if (k === 'z') {
        e.preventDefault();
        e.shiftKey ? this.history.redo() : this.history.undo();
        this.setStatus(e.shiftKey ? "Redo" : "Undo");
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        this.history.redo();
        this.setStatus("Redo");
        return;
      }
      if (k === 'a') {
        e.preventDefault();
        this.state.selectionAnchor = {
          row: 0,
          col: 0
        };
        this.state.cursor = {
          row: this.state.lines.length - 1,
          col: this.state.lines[this.state.lines.length - 1].length
        };
        this.render();
        return;
      }
    }
    if (alt && k === 'p') {
      e.preventDefault();
      this.github.pushFile();
      return;
    }
  }
  getSelectionText() {
    const {
      cursor: c,
      selectionAnchor: s,
      lines: l
    } = this.state;
    if (!s || (s.row === c.row && s.col === c.col)) return null;
    const start = (s.row < c.row || (s.row === c.row && s.col < c.col)) ? s : c;
    const end = (start === s) ? c : s;
    if (start.row === end.row) return l[start.row].slice(start.col, end.col);
    const r = [l[start.row].slice(start.col)];
    for (let i = start.row + 1; i < end.row; i++) r.push(l[i]);
    r.push(l[end.row].slice(0, end.col));
    return r.join('\n');
  }
  newFile() {
    const currentFile = this.state.files[this.state.activeFileIndex];
    if (currentFile.isDirty && !confirm("You have unsaved changes. Are you sure you want to discard them and create a new file?")) {
      this.setStatus("New File creation cancelled.");
      return;
    }
    const newFile = {
      name: `file-${this.state.files.length + 1}.txt`,
      lines: [""],
      isDirty: false,
      cursor: {
        row: 0,
        col: 0
      },
      fileSha: null,
      fullPath: null,
      fileHandle: null
    };
    if (currentFile.lines.length === 1 && currentFile.lines[0] === "" && !currentFile.isDirty) {
      this.state.files[this.state.activeFileIndex] = newFile;
    } else {
      this.state.files.push(newFile);
      this.state.activeFileIndex = this.state.files.length - 1;
    }
    this.search.reset();
    this.state.cursor = {
      row: 0,
      col: 0
    };
    this.state.selectionAnchor = null;
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.history.undoStack = [];
    this.renderTabs();
    this.finalizeUpdate();
    this.setStatus("New File created: " + this.state.fileName);
    const statusEl = document.getElementById('file-status');
    if (statusEl) statusEl.textContent = this.state.fileName;
    this.dom.trap.focus({
      preventScroll: true
    });
  }
  insertSkeleton() {
    if (this.state.lines.length > 1 || (this.state.lines.length === 1 && this.state.lines[0].trim() !== "")) {
      if (!confirm("This will insert a template at your cursor position. Continue?")) return;
    }
    const template = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="description" content="Built with Single Scoop (C) Johnny Heggelund">
      <title>New App</title>
      <style>
        :root {
          --bg: #1e1e1e;
          --text: #d4d4d4;
          --accent: #007acc;
        }
        body {
          margin: 0;
          padding: 20px;
          background-color: var(--bg);
          color: var(--text);
          font-family: system-ui, -apple-system, sans-serif;
          box-sizing: border-box;
        }
        h1 {
          color: var(--accent);
        }
      </style>
    </head>
  <body>
  
  <h1>Hello World 🧩</h1>
  <p>Start building your single-file app here.</p>
  
  <script>
    "use strict";
    console.log("App loaded successfully!");
  <\/script>
  
  </body>
  </html>`;
    this.applyChange(template);
    this.setStatus("Template inserted");
    this.dom.trap.focus({
      preventScroll: true
    });
  }
  setStatus(msg) {
    this.dom.messageArea.textContent = msg;
    clearTimeout(this.statusTimeout);
    this.statusTimeout = setTimeout(() => this.dom.messageArea.textContent = 'SingleScoop.net', 3000);
  }
  async openFile() {
    const isIframe = window.self !== window.top;
    if (!isIframe && 'showOpenFilePicker' in window) {
      try {
        const [h] = await window.showOpenFilePicker();
        const f = await h.getFile();
        this.loadFileContent(await f.text(), f.name, null, null, false, h);
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          this.setStatus("File open cancelled.");
          return;
        }
        console.warn("Moderne åpning feilet, prøver gammel metode...", e);
        this.setStatus("Modern file API failed, trying fallback.");
      }
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        this.setStatus("File open cancelled.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        this.loadFileContent(evt.target.result, file.name);
      };
      reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }
  loadFileContent(text, name, fullPath = null, fileSha = null, newTab = false, fileHandle = null) {
    const currentFile = this.state.files[this.state.activeFileIndex];
    const path = fullPath || name;
    const isPristine = currentFile.lines.length === 1 &&
      currentFile.lines[0] === "" &&
      !currentFile.isDirty &&
      (currentFile.name === 'newfile.txt' || currentFile.name === 'index.html' || currentFile.name.startsWith('file-'));
    if (newTab || !isPristine) {
      const newFile = {
        name: name,
        fullPath: path,
        lines: [""],
        isDirty: false,
        cursor: {
          row: 0,
          col: 0
        },
        fileSha: fileSha,
        fileHandle: fileHandle
      };
      this.state.files.push(newFile);
      this.state.activeFileIndex = this.state.files.length - 1;
    } else {
      this.state.files[this.state.activeFileIndex].name = name;
      this.state.files[this.state.activeFileIndex].fullPath = path;
      this.state.files[this.state.activeFileIndex].fileSha = fileSha;
      this.state.files[this.state.activeFileIndex].fileHandle = fileHandle;
    }
    this.search.reset();
    this.state.lines = text.replace(/\r\n/g, '\n').split('\n');
    this.state.fileName = name;
    this.state.cursor = {
      row: 0,
      col: 0
    };
    this.state.selectionAnchor = null;
    this.state.isDirty = false;
    this.highlighter.analyze(this.state.lines, this.state.fileName);
    this.history.undoStack = [];
    this.renderTabs();
    this.finalizeUpdate();
    this.setStatus("Opened: " + name);
    const statusEl = document.getElementById('file-status');
    if (statusEl) statusEl.textContent = name;
    this.dom.trap.focus({
      preventScroll: true
    });
  }
  async saveFile() {
    const activeFile = this.state.files[this.state.activeFileIndex];
    const content = this.state.lines.join('\n');
    let handle = activeFile.fileHandle;
    let fileName = activeFile.name;
    try {
      if (!handle) {
        if (!('showSaveFilePicker' in window)) {
          throw new Error('Modern file API not supported.');
        }
        const opts = {
          suggestedName: fileName,
          types: [{
            description: 'Text Files',
            accept: {
              'text/plain': ['.txt', '.js', '.html', '.css', '.json', '.md']
            }
          }, ],
        };
        handle = await window.showSaveFilePicker(opts);
        activeFile.fileHandle = handle;
        fileName = handle.name;
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      activeFile.name = fileName;
      activeFile.isDirty = false;
      this.state.fileName = fileName;
      this.renderTabs();
      this.setStatus(`Saved: ${fileName}`);
      document.title = fileName + " - SingleScoop.net";
    } catch (e) {
      if (e.name === 'AbortError') {
        this.setStatus("Save cancelled by user.");
      } else if ('showSaveFilePicker' in window) {
        this.setStatus(`Error saving file: ${e.message}`);
        console.error("Error saving file with modern API:", e);
      } else {
        console.warn("Modern file API not supported, falling back to download.");
        this.setStatus("Modern API not available. Downloading file...");
        const blob = new Blob([content], {
          type: 'text/plain;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        activeFile.isDirty = false;
        this.renderTabs();
        this.setStatus(`Exported: ${fileName}`);
        document.title = fileName + " - SingleScoop.net";
      }
    } finally {
      this.dom.trap.focus({
        preventScroll: true
      });
    }
  }
  setupDragAndDrop() {
    const dropZone = document.body;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    dropZone.addEventListener('dragover', () => dropZone.style.opacity = '0.7');
    dropZone.addEventListener('dragleave', () => dropZone.style.opacity = '1');
    dropZone.addEventListener('drop', () => dropZone.style.opacity = '1');
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.handleDroppedFile(files[0]);
      }
    });
  }
  handleDroppedFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result;
      if (content === null || content === undefined) {
        return;
      }
      this.loadFileContent(content, file.name);
    };
    reader.onerror = (err) => {
      alert("Error reading file");
    };
    reader.readAsText(file);
  }
}
class ImageGeneratorManager {
  constructor(editor) {
    this.editor = editor;
    this.imageGeneratorModal = document.getElementById('image-gen-modal');
    this.promptInput = document.getElementById('image-gen-prompt');
    this.generateBtn = document.getElementById('image-gen-generate-btn');
    this.outputDiv = document.getElementById('image-gen-output-area');
    this.insertBtn = document.getElementById('image-gen-insert-btn');
    this.closeBtn = document.getElementById('image-gen-close-btn');
    this.settings = {
      prompt: ', realistic style, formal appearance, wearing everyday outfit',
    };
    this.defaultModels = ['turbo', 'sana', 'zimage'];
    this.lastResult = null;
    this.loadSettings();
    this.initEventListeners();
  }
  initEventListeners() {
    if (this.imageGeneratorModal) {
      this.closeBtn.onclick = () => this.hideModal();
      this.generateBtn.onclick = () => this.generateImage();
      this.insertBtn.onclick = () => this.insertResult();
      this.promptInput.addEventListener('change', () => this.saveSettings());
    }
  }
  loadSettings() {
    const storedSettings = localStorage.getItem('singlescoop_image_gen_settings');
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        this.settings = {
          ...this.settings,
          ...parsed
        };
      } catch (e) {
        console.error("Failed to parse Image Generator settings", e);
      }
    }
    this.promptInput.value = this.settings.prompt;
  }
  saveSettings() {
    this.settings.prompt = this.promptInput.value.trim();
    localStorage.setItem('singlescoop_image_gen_settings', JSON.stringify(this.settings));
    this.editor.setStatus("Image Generator settings saved.");
  }
  showModal() {
    if (this.imageGeneratorModal) {
      this.imageGeneratorModal.style.display = 'flex';
      this.loadSettings();
      this.outputDiv.innerHTML = "Enter a prompt and click Generate.";
      this.lastResult = null;
      this._updateInsertButton();
      setTimeout(() => this.promptInput.focus(), 50);
    }
  }
  hideModal() {
    if (this.imageGeneratorModal) {
      this.imageGeneratorModal.style.display = 'none';
      requestAnimationFrame(() => {
        this.editor.render();
        this.editor.dom.trap.focus();
      });
      this.editor.finalizeUpdate();
    }
  }
  _updateInsertButton() {
    if (this.insertBtn) {
      this.insertBtn.disabled = !this.lastResult;
      this.insertBtn.style.opacity = this.lastResult ? '1' : '0.5';
      this.insertBtn.style.cursor = this.lastResult ? 'pointer' : 'default';
    }
  }
  async generateImage() {
    this.saveSettings();
    const prompt = this.settings.prompt;
    if (!prompt) {
      this.outputDiv.innerHTML = "Please enter an image prompt.";
      this.editor.setStatus("Image Generator: Missing prompt");
      return;
    }
    this.generateBtn.textContent = "Loading...";
    this.generateBtn.disabled = true;
    this.insertBtn.disabled = true;
    this.insertBtn.style.opacity = '0.5';
    this.insertBtn.style.cursor = 'default';
    this.lastResult = null;
    this.editor.showLoading("Generating image...");
    let lastError = null;
    for (const model of this.defaultModels) {
      this.outputDiv.innerHTML = `Generating image from Pollinations.ai (model: ${model})...`;
      try {
        const seed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&seed=${seed}`;
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status} for model ${model}`);
        }
        this.lastResult = response.url;
        this.outputDiv.innerHTML = `<img src="${this.lastResult}" alt="Generated Image" style="max-width:100%; height:auto; display:block; margin:auto;">`;
        break;
      } catch (error) {
        console.warn(`Error with model ${model}:`, error.message);
        lastError = error;
      }
    }
    if (!this.lastResult && lastError) {
      this.outputDiv.innerHTML = `<p style="color:#ff5555;">Error generating image: ${lastError.message}. Please check prompt.</p>`;
      this.editor.setStatus(`Image Gen Error: ${lastError.message}`);
    } else if (!this.lastResult) {
      this.outputDiv.innerHTML = `<p style="color:#ff5555;">Could not generate image with any available models.</p>`;
      this.editor.setStatus(`Image Gen Error: No models succeeded.`);
    }
    this.generateBtn.textContent = "Generate";
    this.generateBtn.disabled = false;
    this._updateInsertButton();
    this.editor.hideLoading();
  }
  insertResult() {
    if (this.lastResult) {
      const imgTag = `<img src="${this.lastResult}" alt="Generated Image" />`;
      this.editor.applyChange(imgTag);
      this.editor.setStatus("Inserted image URL");
      const originalText = this.insertBtn.innerHTML;
      this.insertBtn.innerHTML = 'Inserted! ✅';
      this.insertBtn.classList.add('blink-success');
      setTimeout(() => {
        this.insertBtn.innerHTML = originalText;
        this.insertBtn.classList.remove('blink-success');
      }, 1000);
      this.hideModal();
    }
  }
}
const colorPalette = [
  '#ffffff', '#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#212121', '#000000',
  '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
  '#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f',
  '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
  '#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92',
  '#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e',
  '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
  '#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b',
  '#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064',
  '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
  '#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
  '#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e',
  '#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717',
  '#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17',
  '#fff8e1', '#ffecb3', '#ffe0b2', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00',
  '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100', '#bf360c',
  '#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c',
  '#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723',
  '#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c', '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'
];

function initColorPicker() {
  const grid = document.getElementById('color-grid');
  grid.innerHTML = '';
  colorPalette.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    if (color === '#000000' || color === '#212121') {
      swatch.style.border = '1px solid #555';
    }
    swatch.onclick = () => {
      insertColor(color);
    };
    grid.appendChild(swatch);
  });
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('color-picker');
    const btn = document.getElementById('color-btn');
    if (picker && picker.style.display !== 'none' && !picker.contains(e.target) && e.target !== btn) {
      picker.style.display = 'none';
      if (window.editor) {
        window.editor.dom.trap.focus({
          preventScroll: true
        });
        window.editor.finalizeUpdate();
      }
    }
  });
}

function toggleColorPicker() {
  const picker = document.getElementById('color-picker');
  const isHidden = picker.style.display === 'none';
  picker.style.display = isHidden ? 'block' : 'none';
  if (isHidden && document.getElementById('color-grid').children.length === 0) {
    initColorPicker();
  }
  if (!isHidden && window.editor) {
    window.editor.dom.trap.focus({
      preventScroll: true
    });
  }
}

function insertColor(hex) {
  navigator.clipboard.writeText(hex).then(() => {
    if (window.editor) {
      window.editor.applyChange(hex);
      window.editor.setStatus(`Inserted ${hex}`);
      window.editor.dom.trap.focus({
        preventScroll: true
      });
    }
  });
  document.getElementById('color-picker').style.display = 'none';
}
class GeminiBrain {
  constructor(editor) {
    this.editor = editor;
    this.apiKey = null;
    this.savedModel = null;
    this.chatHistory = [];
    this.sidebar = document.getElementById('chat-sidebar');
    this.historyDiv = document.getElementById('chat-history');
    this.input = document.getElementById('chat-input');
    this.updateSelector("Setup Required ➡️");
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendUserMessage();
      }
    });
    this.initData();
  }
  initData() {
    const storedKey = localStorage.getItem('singlescoop_gemini_key');
    if (storedKey && storedKey.trim().length > 5) {
      this.apiKey = storedKey;
    }
    this.savedModel = localStorage.getItem('singlescoop_selected_model');
    if (this.apiKey) {
      this.fetchModels();
    }
  }
  toggleChat() {
    const isHidden = this.sidebar.style.display === 'none' || this.sidebar.style.display === '';
    this.sidebar.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      this.input.focus();
      this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
    } else {
      this.editor.dom.trap.focus({
        preventScroll: true
      });
      this.editor.finalizeUpdate();
    }
  }
  clearChat() {
    this.chatHistory = [];
    this.historyDiv.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Chat history cleared.</div>';
  }
  appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg chat-${role}`;
    if (role === 'ai') {
      const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
      for (let i = 0; i < parts.length; i++) {
        const content = parts[i];
        if (!content) continue;
        if (i % 3 === 0) {
          const textSpan = document.createElement('div');
          textSpan.className = 'chat-ai-text';
          textSpan.textContent = content;
          msgDiv.appendChild(textSpan);
        } else if (i % 3 === 2) {
          const wrapper = document.createElement('div');
          wrapper.className = 'chat-code-block';
          const header = document.createElement('div');
          header.className = 'chat-code-header';
          const btn = document.createElement('button');
          btn.className = 'apply-btn';
          btn.innerHTML = 'Place in Editor ⚡';
          btn.onclick = () => {
            window.editor.applyChange(content);
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Placed! ✅';
            setTimeout(() => btn.innerHTML = originalText, 1500);
          };
          header.appendChild(btn);
          wrapper.appendChild(header);
          const codeContent = document.createElement('div');
          codeContent.className = 'chat-code-content';
          codeContent.contentEditable = "true";
          codeContent.spellcheck = false;
          codeContent.textContent = content;
          wrapper.appendChild(codeContent);
          msgDiv.appendChild(wrapper);
        }
      }
    } else {
      msgDiv.textContent = text;
    }
    this.historyDiv.appendChild(msgDiv);
    if (role === 'ai') {
      msgDiv.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } else {
      this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
    }
  }
  async sendUserMessage() {
    const text = this.input.value.trim();
    if (!text) return;
    if (!this.apiKey) {
      this.showSetupModal();
      return;
    }
    this.appendMessage('user', text);
    this.input.value = '';
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.className = 'chat-msg chat-ai';
    loadingDiv.textContent = 'Reading project files & thinking... 🧠';
    this.historyDiv.appendChild(loadingDiv);
    this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000);
    try {
      let projectContext = "PROJECT CONTEXT (Multi-file):\n\n";
      this.editor.state.files.forEach(file => {
        projectContext += `--- FILE: ${file.name} ---\n\`\`\`\n${file.lines.join('\n')}\n\`\`\`\n\n`;
      });
      const activeFileName = this.editor.state.fileName;
      const selection = this.editor.getSelectionText();
      let prompt = `${projectContext}\n\nThe user is currently looking at the file: "${activeFileName}".\n`;
      if (selection) {
        prompt += `USER SELECTED CODE (in ${activeFileName}):\n\`\`\`\n${selection}\n\`\`\`\n`;
      }
      prompt += `\nUSER QUESTION: ${text}`;
      const historyPayload = this.chatHistory.map(h => {
        if (h.role === 'ai') {
          return {
            role: 'model',
            parts: [{
              text: '[Code from previous turn hidden for brevity.]'
            }]
          };
        }
        return {
          role: 'user',
          parts: [{
            text: h.text
          }]
        };
      });
      const contents = [...historyPayload];
      contents.push({
        role: 'user',
        parts: [{
          text: prompt
        }]
      });
      const selector = document.getElementById('model-selector');
      const modelName = selector && selector.value ? selector.value : 'gemini-1.5-flash';
      const payload = {
        contents: contents,
        system_instruction: {
          parts: [{
            text: `SYSTEM: You are an expert web developer acting as a thoughtful coding partner.
  
  RULES:
  1. DISCUSSION FIRST: Analyze the request and discuss the plan briefly. Do not output code immediately unless the request is trivial or urgent.
  2. NO COMMENTS: Markdown code blocks must contain ONLY pure, runnable code. Absolutely no comments (// or /* */) or conversational text inside code blocks.
  3. ATOMIC REPLACEMENTS: Do not return the entire file or the script tag. Return ONLY the specific functions, classes, or CSS rules that need changing. Each function/rule must be in its own separate markdown code block.
  4. REGEX HANDLING: To prevent formatting issues in the API response, long Regular Expressions must be broken into multi-line strings using the 'new RegExp()' constructor or template literals where appropriate, ensuring they remain valid and functional.
  5. FILE & IDENTIFIER: Before each code block, specify the file and the specific part being replaced: "--- FILE: filename | REPLACE: functionName/className ---".
  6. FORMAT: Use standard markdown code blocks (e.g. \`\`\`javascript) for code.`
          }]
        }
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("Empty response from AI");
      }
      const aiText = data.candidates[0].content.parts[0].text;
      this.chatHistory.push({
        role: 'user',
        text: text
      });
      this.chatHistory.push({
        role: 'ai',
        text: aiText
      });
      if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
      this.appendMessage('ai', aiText);
    } catch (e) {
      console.error(e);
      const errDiv = document.createElement('div');
      errDiv.className = 'chat-msg chat-ai';
      errDiv.style.color = '#ff5555';
      errDiv.textContent = "Error: " + e.message;
      if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
      this.historyDiv.appendChild(errDiv);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  updateSelector(text, value = "") {
    const selector = document.getElementById('model-selector');
    if (selector) selector.innerHTML = `<option value="${value}" disabled selected>${text}</option>`;
  }
  async fetchModels() {
    const selector = document.getElementById('model-selector');
    if (!selector || !this.apiKey) return;
    this.updateSelector("Loading models...");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!response.ok) throw new Error("Invalid Key");
      const data = await response.json();
      const chatModels = data.models
        .filter(m => m.supportedGenerationMethods.includes("generateContent") && m.name.includes("gemini"))
        .map(m => m.name.replace('models/', ''));
      selector.innerHTML = '';
      chatModels.forEach(modelName => {
        const option = document.createElement('option');
        option.value = modelName;
        option.text = modelName.includes('flash') ? `⚡ ${modelName}` : `🧠 ${modelName}`;
        selector.appendChild(option);
      });
      if (this.savedModel && chatModels.includes(this.savedModel)) {
        selector.value = this.savedModel;
      } else {
        selector.value = chatModels[0];
      }
    } catch (e) {
      this.apiKey = null;
      localStorage.removeItem('singlescoop_gemini_key');
      this.updateSelector("Setup Required ➡️");
    }
  }
  saveModelPreference() {
    const selector = document.getElementById('model-selector');
    if (selector && selector.value) {
      localStorage.setItem('singlescoop_selected_model', selector.value);
    }
  }
  showSetupModal() {
    const existing = document.getElementById('ai-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'ai-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
              <div class="modal-box" style="width: 450px; padding: 25px; box-sizing: border-box; background: #1e1e1e; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative;">
                  
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                      <h2 style="margin:0; color:#4fc1ff;">AI Setup 🤖</h2>
                      <button id="ai-close-btn" style="background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:0 5px;" title="Close">✕</button>
                  </div>
  
                  <p style="color:#ccc; font-size: 14px; margin-bottom: 20px; line-height: 1.5;">
                      Get your free key from Google AI Studio:<br>
                      <a href="https://aistudio.google.com/api-keys" target="_blank" style="color: #4fc1ff; text-decoration: none; font-weight: bold; border-bottom: 1px dashed #4fc1ff; display: inline-block; margin-top: 5px;">
                          Open Google AI Studio ↗
                      </a>
                  </p>
  
                  <input id="ai-key-input" type="password" value="${this.apiKey || ''}" placeholder="Paste API key here..." 
                         style="width:100%; padding:10px; margin-bottom:20px; background:#222; color:#fff; border:1px solid #444; border-radius:4px; box-sizing: border-box; outline:none;">
                  
                  <div style="display:flex; justify-content: flex-end; gap: 10px;">
                      <button id="ai-save-btn" style="background:#4fc1ff; color:#1e1e1e; border:none; padding:8px 20px; font-weight:bold; border-radius:4px; cursor:pointer;">Save</button>
                  </div>
              </div>`;
    document.body.appendChild(modal);
    const closeModalAndRefreshEditor = () => {
      modal.remove();
      this.editor.dom.trap.focus({
        preventScroll: true
      });
      this.editor.finalizeUpdate();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModalAndRefreshEditor();
    });
    document.getElementById('ai-close-btn').onclick = () => closeModalAndRefreshEditor();
    document.getElementById('ai-save-btn').onclick = () => {
      const key = document.getElementById('ai-key-input').value.trim();
      if (key) {
        this.apiKey = key;
        localStorage.setItem('singlescoop_gemini_key', this.apiKey);
        closeModalAndRefreshEditor();
        this.editor.setStatus("AI Connected! 🧠");
        this.fetchModels();
      }
    };
    setTimeout(() => {
      document.getElementById('ai-key-input').focus();
    }, 50);
  }
}
class GitHubManager {
  constructor(editor) {
    this.editor = editor;
    this.settings = {
      pat: null,
      owner: null,
      repo: null,
      branch: 'main',
      fullPath: '/',
    };
    this.githubModal = document.getElementById('github-modal');
    this.settingsArea = document.getElementById('github-settings-area');
    this.browserArea = document.getElementById('github-browser-area');
    this.patInput = document.getElementById('github-pat-input');
    this.ownerInput = document.getElementById('github-owner-input');
    this.branchInput = document.getElementById('github-branch-input');
    this.repoSelector = document.getElementById('github-repo-selector');
    this.currentPathDisplay = document.getElementById('github-file-browser-current-path');
    this.fileBrowserContent = document.getElementById('github-file-browser-content');
    this.settingsToggleButton = document.getElementById('github-settings-toggle-btn');
    this.saveSettingsBtn = document.getElementById('github-save-settings-btn');
    this.refreshReposBtn = document.getElementById('github-refresh-repos-btn');
    this.pushBtn = document.getElementById('github-push-btn');
    this.backButton = document.getElementById('github-file-browser-back-btn');
    this.pullSelectedBtn = document.getElementById('github-pull-selected-btn');
    this.selectedFilesCountSpan = document.getElementById('github-selected-files-count');
    this.currentRepoTreeSha = null;
    this.folderShas = {};
    this.selectedFiles = new Set();
    this.initEventListeners();
    this.loadSettings();
  }
  initEventListeners() {
    if (this.githubModal) {
      document.getElementById('github-close-btn').onclick = () => this.hideSettingsModal();
      if (this.settingsToggleButton) {
        this.settingsToggleButton.onclick = () => this.toggleSettingsVisibility();
      }
      if (this.saveSettingsBtn) {
        this.saveSettingsBtn.onclick = () => this.saveSettings();
      }
      if (this.refreshReposBtn) {
        this.refreshReposBtn.onclick = () => this.fetchUserRepositories(true);
      }
      if (this.repoSelector) {
        this.repoSelector.onchange = () => this.selectRepository(this.repoSelector.value);
      }
      if (this.pushBtn) {
        this.pushBtn.onclick = () => {
          this.pushFile();
        };
      }
      if (this.backButton) {
        this.backButton.onclick = () => this.navigateFileBrowserBack();
      }
      if (this.pullSelectedBtn) {
        this.pullSelectedBtn.onclick = () => this.pullSelectedFiles();
      }
    }
  }
  loadSettings() {
    const storedSettings = localStorage.getItem('singlescoop_github_settings');
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        this.settings = {
          ...this.settings,
          ...parsed
        };
        if (parsed.filePath && parsed.filePath !== '/') {
          this.settings.fullPath = parsed.filePath;
        } else if (!this.settings.fullPath) {
          this.settings.fullPath = '/';
        }
        delete this.settings.lastFetchedSha;
        delete this.settings.filePath;
        this.updateInputs();
      } catch (e) {
        console.error("Failed to parse GitHub settings", e);
      }
    }
  }
  saveSettings() {
    this.settings.pat = this.patInput.value.trim();
    this.settings.owner = this.ownerInput.value.trim();
    this.settings.branch = this.branchInput.value.trim();
    localStorage.setItem('singlescoop_github_settings', JSON.stringify(this.settings));
    this.editor.setStatus("GitHub settings saved.");
    const btn = this.saveSettingsBtn;
    if (btn) {
      const originalText = "Save Settings";
      btn.textContent = "Saved! ✅";
      btn.classList.add('blink-success');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('blink-success');
      }, 1000);
    }
    this.fetchUserRepositories(true);
  }
  updateInputs() {
    this.patInput.value = this.settings.pat || '';
    this.ownerInput.value = this.settings.owner || '';
    this.branchInput.value = this.settings.branch || 'main';
  }
  showSettingsModal() {
    this.updateInputs();
    if (this.githubModal) {
      this.githubModal.style.display = 'flex';
      this._renderGitHubModalUI();
      setTimeout(() => {
        if (this.settingsArea.style.display !== 'none') {
          this.patInput.focus();
        } else {
          this.repoSelector.focus();
        }
      }, 50);
    }
  }
  hideSettingsModal() {
    if (this.githubModal) {
      this.githubModal.style.display = 'none';
      requestAnimationFrame(() => {
        this.editor.render();
        this.editor.dom.trap.focus();
      });
      this.editor.finalizeUpdate();
    }
    this.selectedFiles.clear();
    this._updatePullSelectedButton();
  }
  toggleSettingsVisibility() {
    const isSettingsVisible = this.settingsArea.style.display !== 'none';
    this.settingsArea.style.display = isSettingsVisible ? 'none' : 'block';
    this.browserArea.style.display = isSettingsVisible ? 'flex' : 'none';
    if (!isSettingsVisible) {
      this.patInput.focus();
    } else {
      this.repoSelector.focus();
    }
  }
  _renderGitHubModalUI() {
    const {
      pat,
      owner,
      repo,
      branch
    } = this.settings;
    const hasConfig = pat && owner && repo && branch;
    if (hasConfig) {
      this.settingsArea.style.display = 'none';
      this.browserArea.style.display = 'flex';
      this.settingsToggleButton.style.display = 'block';
      this.fetchUserRepositories();
      this.fetchRepositoryTree();
    } else {
      this.settingsArea.style.display = 'block';
      this.browserArea.style.display = 'none';
      this.settingsToggleButton.style.display = 'none';
    }
    this.currentPathDisplay.textContent = this.settings.fullPath;
    this.backButton.disabled = this.settings.fullPath === '/';
    this.backButton.style.opacity = this.settings.fullPath === '/' ? '0.5' : '1';
  }
  async fetchUserRepositories(forceRefresh = false) {
    const {
      pat,
      owner
    } = this.settings;
    if (!pat || !owner) return;
    if (this.repoSelector.options.length > 1 && !forceRefresh) return;
    this.repoSelector.innerHTML = '<option value="" disabled>Loading repositories...</option>';
    this.editor.showLoading("Fetching repositories...");
    try {
      const response = await fetch(`https://api.github.com/users/${owner}/repos?type=all&per_page=100`, {
        headers: this._getGitHubApiHeaders(pat)
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
      }
      const repos = await response.json();
      this.repoSelector.innerHTML = '<option value="" disabled selected>Select a repository...</option>';
      repos.sort((a, b) => a.name.localeCompare(b.name));
      repos.forEach(r => {
        const option = document.createElement('option');
        option.value = r.full_name;
        option.textContent = r.name;
        this.repoSelector.appendChild(option);
      });
      if (this.settings.repo) {
        const currentRepoFullName = `${this.settings.owner}/${this.settings.repo}`;
        if (Array.from(this.repoSelector.options).some(opt => opt.value === currentRepoFullName)) {
          this.repoSelector.value = currentRepoFullName;
        } else {
          this.repoSelector.innerHTML += `<option value="${currentRepoFullName}" selected>${this.settings.repo} (Not found)</option>`;
          this.editor.setStatus("Warning: Configured repo not found in list.");
        }
      } else if (repos.length > 0) {
        this.repoSelector.value = repos[0].full_name;
        this.selectRepository(repos[0].full_name);
      }
    } catch (e) {
      this.editor.setStatus(`Repo Fetch Error: ${e.message}`);
      console.error("Repo Fetch Error:", e);
      this.repoSelector.innerHTML = '<option value="" disabled selected>Error loading repos</option>';
    } finally {
      this.editor.hideLoading();
    }
  }
  async selectRepository(repoFullName) {
    if (!repoFullName) return;
    const [owner, repo] = repoFullName.split('/');
    this.settings.owner = owner;
    this.settings.repo = repo;
    this.settings.fullPath = '/';
    this.selectedFiles.clear();
    this._updatePullSelectedButton();
    await this.saveSettings();
    this.fetchRepositoryTree();
  }
  async navigateFileBrowserBack() {
    if (this.settings.fullPath === '/') {
      this.editor.setStatus("Already at repository root.");
      return;
    }
    const pathParts = this.settings.fullPath.split('/');
    pathParts.pop();
    this.settings.fullPath = pathParts.join('/') || '/';
    this.currentRepoTreeSha = this.folderShas[this.settings.fullPath] || null;
    this.selectedFiles.clear();
    this._updatePullSelectedButton();
    await this.fetchRepositoryTree();
  }
  async fetchRepositoryTree(requestedPath = null) {
    const {
      owner,
      repo,
      branch,
      pat
    } = this.settings;
    if (!owner || !repo || !branch || !pat) {
      this.fileBrowserContent.innerHTML = '<p style="color:#888;">Configure GitHub settings to browse.</p>';
      this.currentPathDisplay.textContent = '/';
      return;
    }
    this.fileBrowserContent.innerHTML = '<p style="color:#888;">Loading repository tree...</p>';
    this.currentPathDisplay.textContent = requestedPath || this.settings.fullPath;
    this.editor.showLoading("Fetching content...");
    this.selectedFiles.clear();
    this._updatePullSelectedButton();
    this.backButton.disabled = this.settings.fullPath === '/';
    this.backButton.style.opacity = this.settings.fullPath === '/' ? '0.5' : '1';
    try {
      let treeShaToFetch = null;
      if (requestedPath) {
        const item = this.folderShas[requestedPath];
        if (item && item.type === 'tree') {
          treeShaToFetch = item.sha;
          this.settings.fullPath = requestedPath;
        } else if (item && item.type === 'blob') {
          return;
        }
      }
      if (!treeShaToFetch) {
        const branchRefUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`;
        const branchRefResponse = await fetch(branchRefUrl, {
          headers: this._getGitHubApiHeaders(pat)
        });
        if (!branchRefResponse.ok) throw new Error(`Failed to get branch ref for ${branch}`);
        const branchRefData = await branchRefResponse.json();
        const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${branchRefData.object.sha}`;
        const commitResponse = await fetch(commitUrl, {
          headers: this._getGitHubApiHeaders(pat)
        });
        if (!commitResponse.ok) throw new Error("Failed to get commit info");
        const commitData = await commitResponse.json();
        treeShaToFetch = commitData.tree.sha;
      }
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeShaToFetch}?recursive=1`;
      const response = await fetch(treeUrl, {
        headers: this._getGitHubApiHeaders(pat)
      });
      if (!response.ok) throw new Error("Failed to get repository tree");
      const treeData = await response.json();
      this.currentRepoTreeSha = treeShaToFetch;
      this.renderTree(treeData.tree);
    } catch (e) {
      this.fileBrowserContent.innerHTML = `<p style="color:#ff5555;">Error: ${e.message}. Check PAT/Owner/Repo/Branch.</p>`;
    } finally {
      this.editor.hideLoading();
    }
  }
  renderTree(treeData) {
    this.folderShas = {};
    const currentPathNormalized = this.settings.fullPath === '/' ? '' : `${this.settings.fullPath}/`;
    const filteredTree = treeData.filter(item => {
      const itemPathParts = item.path.split('/');
      const currentPathParts = currentPathNormalized.split('/').filter(p => p !== '');
      return itemPathParts.length === currentPathParts.length + 1 && item.path.startsWith(currentPathNormalized);
    });
    const folderList = [];
    const fileList = [];
    filteredTree.forEach(item => {
      if (item.type === 'tree') {
        folderList.push(item);
        this.folderShas[item.path] = item;
      } else if (item.type === 'blob') {
        fileList.push(item);
      }
    });
    folderList.sort((a, b) => a.path.localeCompare(b.path));
    fileList.sort((a, b) => a.path.localeCompare(b.path));
    const listContainer = document.createElement('div');
    listContainer.className = 'github-file-list';
    if (this.currentPathDisplay) {
      this.currentPathDisplay.textContent = this.settings.fullPath;
    }
    folderList.forEach(folder => {
      const div = document.createElement('div');
      div.className = 'folder';
      const folderName = folder.path.split('/').pop();
      div.innerHTML = `<span class="icon">📁</span> ${folderName}`;
      div.onclick = () => {
        this.settings.fullPath = folder.path;
        this.fetchRepositoryTree();
      };
      listContainer.appendChild(div);
    });
    fileList.forEach(file => {
      const div = document.createElement('div');
      div.className = 'file';
      const fileName = file.path.split('/').pop();
      const checkboxId = `file-checkbox-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
      div.innerHTML = `
                  <input type="checkbox" id="${checkboxId}" data-filepath="${file.path}" data-sha="${file.sha}" ${this.selectedFiles.has(file.path) ? 'checked' : ''}>
                  <label for="${checkboxId}" style="flex-grow: 1; cursor: pointer;">
                      <span class="icon">📄</span> ${fileName}
                  </label>
              `;
      div.querySelector(`input[type="checkbox"]`).addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedFiles.add(file.path);
        } else {
          this.selectedFiles.delete(file.path);
        }
        this._updatePullSelectedButton();
      });
      listContainer.appendChild(div);
    });
    if (listContainer.children.length === 0) {
      listContainer.innerHTML = '<p style="color:#888;">No files or folders found here.</p>';
    }
    this.fileBrowserContent.innerHTML = '';
    this.fileBrowserContent.appendChild(listContainer);
    this._updatePullSelectedButton();
  }
  _updatePullSelectedButton() {
    const count = this.selectedFiles.size;
    this.selectedFilesCountSpan.textContent = `${count} files selected`;
    if (count > 0) {
      this.selectedFilesCountSpan.classList.add('visible');
    } else {
      this.selectedFilesCountSpan.classList.remove('visible');
    }
    this.pullSelectedBtn.disabled = count === 0;
    this.pullSelectedBtn.style.opacity = count === 0 ? '0.5' : '1';
    this.pullSelectedBtn.style.cursor = count === 0 ? 'default' : 'pointer';
  }
  async pullSelectedFiles() {
    if (this.selectedFiles.size === 0) {
      this.editor.setStatus("No files selected to pull.");
      return;
    }
    this.editor.showLoading(`Pulling ${this.selectedFiles.size} files...`);
    const filesToPull = Array.from(this.selectedFiles);
    let successCount = 0;
    for (const filePath of filesToPull) {
      try {
        const item = this.fileBrowserContent.querySelector(`input[data-filepath="${filePath}"]`);
        const sha = item ? item.dataset.sha : null;
        await this.pullFile(filePath, sha);
        successCount++;
      } catch (e) {
        this.editor.setStatus(`Failed to pull ${filePath}: ${e.message}`);
        console.error(`Failed to pull ${filePath}:`, e);
      }
    }
    this.editor.setStatus(`Successfully pulled ${successCount} of ${filesToPull.length} files.`);
    this.hideSettingsModal();
  }
  _validateSettings(keys = ['pat', 'owner', 'repo', 'branch']) {
    for (const key of keys) {
      if (!this.settings[key]) return {
        isValid: false,
        message: `Missing: ${key}`
      };
    }
    return {
      isValid: true
    };
  }
  _getGitHubApiHeaders(pat) {
    return {
      'Authorization': `token ${pat}`,
      'Accept': 'application/vnd.github.v3+json'
    };
  }
  async pullFile(targetFilePath = null, targetFileSha = null) {
    const filePath = targetFilePath || this.settings.fullPath;
    const validation = this._validateSettings(['pat', 'owner', 'repo', 'branch']);
    if (!validation.isValid) {
      this.editor.setStatus(`Error: ${validation.message}`);
      return;
    }
    if (!filePath || filePath === '/') {
      this.editor.setStatus("Error: No file selected or current path is a directory.");
      return;
    }
    this.editor.showLoading(`Pulling ${filePath}...`);
    try {
      const {
        owner,
        repo,
        branch,
        pat
      } = this.settings;
      const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const contentsResponse = await fetch(contentsUrl, {
        headers: this._getGitHubApiHeaders(pat)
      });
      if (!contentsResponse.ok) {
        if (contentsResponse.status === 404) {
          throw new Error("File not found in the repository.");
        }
        throw new Error(`Failed to fetch file metadata: ${contentsResponse.statusText}`);
      }
      const contentsData = await contentsResponse.json();
      const fileSha = contentsData.sha;
      const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${fileSha}`;
      const blobResponse = await fetch(blobUrl, {
        headers: this._getGitHubApiHeaders(pat)
      });
      if (!blobResponse.ok) {
        throw new Error(`Failed to fetch blob content: ${blobResponse.statusText}`);
      }
      const blobData = await blobResponse.json();
      if (blobData.encoding !== 'base64') {
        throw new Error('Blob content is not base64 encoded, cannot decode.');
      }
      const decodedUint8 = Uint8Array.from(atob(blobData.content), c => c.charCodeAt(0));
      const content = new TextDecoder().decode(decodedUint8);
      this.editor.loadFileContent(content, filePath.split('/').pop(), filePath, fileSha, true);
      this.editor.setStatus(`Pulled: ${filePath}`);
    } catch (e) {
      this.editor.setStatus(`Pull Error: ${e.message}`);
      throw e;
    } finally {
      this.editor.hideLoading();
    }
  }
  async pushFile() {
    const validation = this._validateSettings(['pat', 'owner', 'repo', 'branch']);
    if (!validation.isValid) {
      this.editor.setStatus(`Error: ${validation.message}`);
      return;
    }
    const activeFile = this.editor.state.files[this.editor.state.activeFileIndex];
    if (activeFile.fullPath === '/' || !activeFile.fullPath) {
      this.editor.setStatus("Error: Cannot push, active file has no GitHub path. Please save it locally or pull it from GitHub first.");
      return;
    }
    const msg = `Update ${activeFile.name} via Single Scoop`;
    this.editor.showLoading("Pushing...");
    try {
      const {
        owner,
        repo,
        branch,
        pat
      } = this.settings;
      const content = activeFile.lines.join('\n');
      let sha = activeFile.fileSha;
      if (!sha) {
        const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${activeFile.fullPath}?ref=${branch}`;
        const getRes = await fetch(getUrl, {
          headers: this._getGitHubApiHeaders(pat)
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          sha = getData.sha;
        } else if (getRes.status === 404) {
          sha = undefined;
        } else {
          throw new Error(`Failed to check existing file SHA: ${getRes.statusText}`);
        }
      }
      const encodedContent = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(content)));
      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${activeFile.fullPath}`;
      const payload = {
        message: msg,
        content: encodedContent,
        branch: branch
      };
      if (sha) payload.sha = sha;
      const response = await fetch(putUrl, {
        method: 'PUT',
        headers: this._getGitHubApiHeaders(pat),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || response.statusText);
      }
      const data = await response.json();
      activeFile.fileSha = data.content.sha;
      activeFile.isDirty = false;
      this.editor.renderTabs();
      this.editor.setStatus("Pushed successfully! 🚀");
      const btn = this.pushBtn;
      if (btn) {
        const originalText = "☁️ Push Active File";
        btn.innerHTML = "Pushed! ✅";
        btn.classList.add('blink-success');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('blink-success');
        }, 1000);
      }
    } catch (e) {
      this.editor.setStatus(`Push Error: ${e.message}`);
      console.error(e);
    } finally {
      this.editor.hideLoading();
    }
  }
}
window.onload = () => {
  window.editor = new EditorEngine();
};
window.onbeforeunload = (e) => {
  if (window.editor && window.editor.state.isDirty) {
    const confirmationMessage = "You have unsaved changes. Do you want to close and discard them?";
    e.preventDefault();
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
  return undefined;
};
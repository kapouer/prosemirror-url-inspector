module.exports = Blocks;
var domify = require('domify');
function htmlToFrag(str, doc) {
	var node = domify(str, doc);
	if (node && node.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var frag = doc.createDocumentFragment();
		frag.appendChild(node);
		node = frag;
	}
	return node;
}

function Blocks(view, opts) {
	this.view = view;
	this.store = {};
	this.initial = {};
	if (opts.genId) this.genId = opts.genId;
}

Blocks.prototype.render = function(block, opts) {
	if (!opts) opts = {};
	var type = opts.type || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown block.type ${type}`);
	var dom = el.render.call(el, this.view.doc, block, this.view, opts.scope || {});
	if (dom && opts.merge !== false) this.merge(dom, block, type);
	return dom;
};

Blocks.prototype.mount = function(block, blocks, overrideType) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, div, frag, view = this.view;
	if (contents) for (var name in contents) {
		content = contents[name];
		if (!(content instanceof Node)) {
			copy.content[name] = htmlToFrag(content, view.doc);
		}
	}
	if (!overrideType) overrideType = copy.type;
	var el = view.element(overrideType);
	if (!el) {
		console.error("Cannot find element for block type", overrideType);
		return copy;
	}
	return Promise.resolve().then(function() {
		if (el.mount) return el.mount(copy, blocks, view);
	}).then(function() {
		return copy;
	});
};

Blocks.prototype.copy = function(block) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	if (block.content) copy.content = Object.assign({}, block.content);
	delete copy.focused;
	return copy;
};

Blocks.prototype.merge = function(dom, block, overrideType) {
	if (dom.nodeType != Node.ELEMENT_NODE) return;
	var el = this.view.element(overrideType || block.type);
	var contents = block.content;
	if (!contents) return;
	if (!el.contents) return;
	if (el.inplace) return;
	if (typeof el.contents != "string") Object.keys(el.contents).forEach(function(name) {
		var blockContent = dom.getAttribute('block-content');
		var node;
		if (blockContent) {
			if (name == blockContent) node = dom;
		} else if (el.inline) {
			node = dom;
		} else {
			node = dom.querySelector(`[block-content="${name}"]`);
		}
		if (!node) return;
		var content = contents[name];
		if (!content) return;
		if (typeof content == "string") {
			content = node.ownerDocument.createTextNode(content);
		} else if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			content = node.ownerDocument.importNode(content, true);
		} else {
			console.warn("cannot merge content", content);
			return;
		}
		if (node.childNodes.length == 1 && node.firstChild.nodeType == Node.TEXT_NODE) {
			node.textContent = "";
		}
		node.appendChild(content);
	});
	else if (Object.keys(block.content).length) {
		console.warn("Cannot mount block", block);
	}
};

Blocks.prototype.from = function(block, blocks, overrideType, scope) {
	// blocks can be a block or a map of blocks
	// if it's a block, it can have a 'children' property
	var self = this;
	var view = this.view;
	var store = {};

	var frag = "";
	if (typeof block == "string") {
		frag = block;
		block = null;
	}
	if (!blocks) {
		if (block && !block.type) {
			blocks = block;
			block = null;
		}
	}
	if (!blocks) blocks = this.initial = {};
	// it's a map of blocks, we need to find the root block
	if (!block) {
		var id = view.dom.getAttribute('block-id');
		if (!id) { // TODO remove this
			// can't rely on id plugin until view.dom changes are applied by a Step instance
			console.warn("root dom has no id !");
			id = this.genId();
			view.dom.setAttribute('block-id', id);
		}
		var contentName = view.dom.getAttribute('block-content') || 'fragment';
		var frag = "";
		block = blocks[id];
		if (!block) {
			block = {
				id: id,
				type: 'fragment',
				content: {}
			};
			block.content[contentName] = frag;
		}
	}
	return this.parseFrom(block, blocks, store, overrideType, scope).then(function(result) {
		self.store = store;
		return result;
	});
};

Blocks.prototype.parseFrom = function(block, blocks, store, overrideType, scope) {
	var view = this.view;
	var self = this;
	if (!store) store = this.store;
	if (!blocks) blocks = {};
	if (!overrideType) {
		// mount() might change block.type, this ensures block will be rendered correctly
		overrideType = block.type;
	}
	return Promise.resolve().then(function() {
		return self.mount(block, blocks, overrideType, scope);
	}).then(function(block) {
		if (block.children) {
			block.children.forEach(function(child) {
				if (!blocks[child.id]) {
					blocks[child.id] = child;
				} else {
					console.warn("child already exists", child);
				}
			});
		}
		if (block.id) {
			// overwrite can happen with virtual blocks
			if (!store[block.id]) store[block.id] = block;
		}
		var fragment;
		try {
			fragment = view.render(block, {
				type: overrideType,
				scope: scope
			});
		} catch(ex) {
			console.error(ex);
		}
		// children can be consumed once only
		delete block.children;
		if (!fragment) return;
		return Promise.all(Array.from(fragment.querySelectorAll('[block-id]')).map(function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var type = node.getAttribute('block-type');
			var child = blocks[id];
			if (!child) {
				console.warn("Removing unknown block", id);
				node.remove();
				return;
			}
			return self.parseFrom(child, blocks, store, type, scope).then(function(child) {
				if (child) node.parentNode.replaceChild(child, node);
			});
		}, this)).then(function() {
			return fragment;
		});
	});
};


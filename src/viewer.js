module.exports = Viewer;

var BlocksView = require('./blocks-view');

function Viewer(opts) {
	if (!opts) opts = {};
	this.blocks = new BlocksView(this, opts);

	this.doc = opts.document || document.cloneNode();
	this.elements = opts.elements || {};

	// TODO remove this probably useless part
	var map = this.elements = opts.elements || {};
	if (!map.fragment) map.fragment = {
		contents: {
			fragment: {
				spec: "block*"
			}
		},
		render: function renderFragment(doc, block) {
			return block.content.fragment || doc.createElement("div");
		}
	};
}

Viewer.prototype.from = function(block, blocks, overrideType, scope) {
	return this.blocks.from(block, blocks, overrideType, scope);
};

Viewer.prototype.element = function(type) {
	if (!type) return;
	return this.elements[type];
};

Viewer.prototype.render = function(block, opts) {
	var dom;
	if (typeof opts == "string") {
		opts = {type: opts};
		console.warn("view.render now expects opts.type, not string");
	}
	try {
		dom = this.blocks.render(block, opts);
	} catch(ex) {
		console.error(ex);
	}
	if (!dom) return;
	if (dom.nodeName == "HTML") {
		// documentElement is not editable
		if (this.doc.documentElement) {
			this.doc.removeChild(this.doc.documentElement);
		}
		this.doc.appendChild(dom);
		dom = dom.querySelector('body');
		if (!dom) {
			console.error(`${elt.name} returns a document element but does not contain a body`);
		}
	}
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) return dom;

	var type = (opts || {}).type || block.type;
	var el = this.element(type);
	if (!el.inplace) {
		dom.setAttribute('block-type', type);
		if (block.id != null) dom.setAttribute('block-id', block.id);
		else dom.removeAttribute('block-id');
	}

	if (block.focused) dom.setAttribute('block-focused', block.focused);
	else dom.removeAttribute('block-focused');

	return dom;
};


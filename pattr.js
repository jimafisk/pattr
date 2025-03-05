window.Pattr = {
    directives: {
        'p-text': (el, value) => {
            el.innerText = value;
        },
        'p-show': (el, value) => {
            el.style.display = value ? 'block' : 'none';
        },
    },

    async start() {
        this.scopes = new WeakMap();
        this.bindings = new WeakMap(); // Cache directive bindings
        this.root = document.querySelector('[p-data-file-json]');
        if (!this.root) return;

        this.dataFile = this.root.getAttribute('p-data-file-json');
        const rawData = await this.getDataFileJSON(this.dataFile);
        if (rawData) {
            const rootScope = new Scope(rawData, null, this, null);
            this.scopes.set(this.root, rootScope);
            this.registerBindings(this.root, rootScope);
            this.initScopes(this.root);
            this.refreshDom(this.root, new Set());
        }
    },

    initScopes(element) {
        this.walkDom(element, el => {
            if (el === this.root) return;

            if (el.hasAttribute('p-data') || el.hasAttribute('p-data-file-json')) {
                this.createScope(el);
                this.refreshDom(el, new Set());
            }
        });
    },

    createScope(element) {
        const parentScope = this.findParentScope(element);
        let data;

        if (element.hasAttribute('p-data-file-json')) {
            const dataFile = element.getAttribute('p-data-file-json');
            this.getDataFileJSON(dataFile).then(rawData => {
                data = this.evaluateData(rawData, parentScope);
                const scope = new Scope(data, parentScope, this, element.getAttribute('p-data'));
                scope.element = element;
                this.scopes.set(element, scope);
                this.registerBindings(element, scope);
                this.refreshDom(element, new Set());
            });
            return;
        } else if (element.hasAttribute('p-data')) {
            const dataExpr = element.getAttribute('p-data');
            data = this.evaluateData(dataExpr, parentScope);
        }

        const scope = new Scope(data, parentScope, this, element.getAttribute('p-data'));
        scope.element = element;
        this.scopes.set(element, scope);
        this.registerBindings(element, scope);
    },

    findParentScope(element) {
        let parent = element.parentElement;
        while (parent && !this.scopes.has(parent)) {
            parent = parent.parentElement;
        }
        return parent ? this.scopes.get(parent) : null;
    },

    evaluateData(expr, parentScope) {
        const parentData = parentScope?.data || {};
        try {
            return new Function(`with (this) { return (${expr}) }`).call(parentData);
        } catch (e) {
            console.error('Error evaluating p-data:', e);
            return {};
        }
    },

    registerBindings(element, scope) {
        const bindings = [];
        this.walkDom(element, el => {
            Array.from(el.attributes).forEach(attribute => {
                if (attribute.name.startsWith('@')) {
                    const event = attribute.name.replace('@', '');
                    const handler = new Function('scope', `with (scope.data) { ${attribute.value} }`);
                    el.addEventListener(event, () => {
                        handler(scope);
                        this.refreshDom(element, new Set());
                    });
                } else if (this.directives[attribute.name]) {
                    bindings.push({ el, directive: attribute.name, expr: attribute.value });
                }
            });
        });
        this.bindings.set(scope, bindings);
    },

    refreshDom(element, changedKeys) {
        const scope = this.scopes.get(element);
        if (!scope) return;

        // Re-evaluate p-data if parent changed a relevant key
        if (scope.dataExpr && changedKeys.size > 0) {
            const newData = this.evaluateData(scope.dataExpr, scope.parent);
            scope.updateFromParent(newData, changedKeys);
        }

        const bindings = this.bindings.get(scope) || [];
        bindings.forEach(binding => {
            const value = this.evaluateInScope(binding.expr, scope);
            this.directives[binding.directive](binding.el, value);
        });

        scope.children.forEach(childScope => {
            this.refreshDom(childScope.element, changedKeys);
        });
    },

    evaluateInScope(expr, scope) {
        try {
            return new Function(`with (this) { return (${expr}) }`).call(scope.data);
        } catch (e) {
            console.error('Error evaluating expression:', e);
            return null;
        }
    },

    walkDom(el, callback) {
        callback(el);
        let child = el.firstElementChild;
        while (child) {
            this.walkDom(child, callback);
            child = child.nextElementSibling;
        }
    },

    async getDataFileJSON(dataFile) {
        let rawData = null;
        try {
            const response = await fetch(dataFile);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            rawData = await response.json();
        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            rawData = null;
        }
        return rawData;
    },
};

class Scope {
    constructor(data, parentScope, framework, dataExpr) {
        this.parent = parentScope;
        this.framework = framework;
        this.children = [];
        this.element = null;
        this.dataExpr = dataExpr; // Store p-data expression
        this.data = this.observe(data);
        if (parentScope) parentScope.children.push(this);
    }

    observe(initialData) {
        const scope = this;
        return new Proxy({ ...initialData }, {
            get: (target, key) => {
                return key in target ? target[key] : this.parent?.data[key];
            },
            set: (target, key, value) => {
                target[key] = value;
                if (this.element) {
                    const changedKeys = new Set([key]);
                    this.framework.refreshDom(this.element, changedKeys);
                }
                return true;
            },
        });
    }

    updateFromParent(newData, changedKeys) {
        const oldCount = this.data.count;
        Object.assign(this.data, newData);
        if (this.data.count !== oldCount) {
            changedKeys.add('count');
        }
    }
}

window.Pattr.start();

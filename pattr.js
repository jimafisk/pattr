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
        this.scopes = new WeakMap(); // Map elements to their Scope instances
        this.root = document.querySelector('[p-data-file-json]');
        if (!this.root) return;

        // Initialize the root scope
        this.dataFile = this.root.getAttribute('p-data-file-json');
        const rawData = await this.getDataFileJSON(this.dataFile);
        if (rawData) {
            const rootScope = new Scope(rawData, null, this);
            this.scopes.set(this.root, rootScope);
            this.registerListeners(this.root, rootScope);
            this.initScopes(this.root);
            this.refreshDom(this.root);
        }
    },

    initScopes(element) {
        // Walk the DOM to find and initialize nested components
        this.walkDom(element, el => {
            if (el === this.root) return; // Skip root, already initialized

            if (el.hasAttribute('p-data') || el.hasAttribute('p-data-file-json')) {
                this.createScope(el);
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
                const scope = new Scope(data, parentScope, this);
                this.scopes.set(element, scope);
                this.registerListeners(element, scope);
                this.refreshDom(element);
            });
            return; // Defer until data is loaded
        } else if (element.hasAttribute('p-data')) {
            const dataExpr = element.getAttribute('p-data');
            data = this.evaluateData(dataExpr, parentScope);
        }

        const scope = new Scope(data, parentScope, this);
        this.scopes.set(element, scope);
        this.registerListeners(element, scope);
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

    registerListeners(element, scope) {
        this.walkDom(element, el => {
            Array.from(el.attributes).forEach(attribute => {
                if (!attribute.name.startsWith('@')) return;

                const event = attribute.name.replace('@', ''); // e.g., "click", "mouseover"
                const handler = new Function('scope', `with (scope.data) { ${attribute.value} }`);
                el.addEventListener(event, () => {
                    handler(scope);
                    this.refreshDom(element); // Refresh only this scope’s DOM
                });
            });
        });
    },

    refreshDom(element) {
        const scope = this.scopes.get(element);
        if (!scope) return;

        this.walkDom(element, el => {
            Array.from(el.attributes).forEach(attribute => {
                if (!Object.keys(this.directives).includes(attribute.name)) return;

                const value = this.evaluateInScope(attribute.value, scope);
                this.directives[attribute.name](el, value);
            });
        });

        // Cascade updates to children
        scope.children.forEach(childScope => {
            const childElement = childScope.element;
            const newDataExpr = childElement.getAttribute('p-data');
            if (newDataExpr) {
                const newData = this.evaluateData(newDataExpr, scope);
                Object.assign(childScope.data, newData); // Update child data
            }
            this.refreshDom(childElement); // Recursively refresh child
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

// Scope class to manage reactive data and hierarchy
class Scope {
    constructor(data, parentScope, framework) {
        this.parent = parentScope;
        this.framework = framework;
        this.children = [];
        this.element = null; // Set by createScope
        this.data = this.observe(data);
        if (parentScope) parentScope.children.push(this);
    }

    observe(initialData) {
        return new Proxy({ ...initialData }, {
            get: (target, key) => {
                return key in target ? target[key] : this.parent?.data[key];
            },
            set: (target, key, value) => {
                target[key] = value;
                if (this.element) {
                    this.framework.refreshDom(this.element); // Refresh only this scope
                }
                return true;
            },
        });
    }
}

window.Pattr.start();

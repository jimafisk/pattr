window.Pattr = {
    directives: {
        'p-text': (el, value) => {
            el.innerText = value
        },
        'p-show': (el, value) => {
            el.style.display = value ? 'block' : 'none'
        },
    },

    async start() {
        //this.root = document.querySelector('[p-data-file-json]');
        //this.dataFile = this.root.getAttribute('p-data-file-json');
        //this.rawData = await this.getDataFileJSON(this.dataFile)
        const rootDataJsonString = document.getElementById("p-root-data").textContent;
        try {
            this.rawData = JSON.parse(rootDataJsonString || '{}');
        } catch (e) {
            console.error("Error parsing root data JSON:", e);
            this.rawData = {}; // Default to empty object on error
        }
        this.root = document.documentElement;
        //this.rawData = this.gatherData();
        //this.gatherData();
        this.buildScopeData(this.root, this.rawData);
        console.log(this.rawData);
        this.data = this.observe(this.rawData)
        //this.registerListeners()
        //this.refreshDom()
        this.walkDomScoped(this.root, this.data, true);
    },

    //async gatherData() {
    gatherData() {
        //rawData = {};
        this.walkDom(this.root, el => {
            if (el.hasAttribute('p-data')) {
                console.log(el)
                this.rawData._children = el.getAttribute('p-data');
            }
            /*
            if (el.hasAttribute('p-data-file-json')) {
                dataFileFound = el.getAttribute('p-data-file-json');
                //rawData = await this.getDataFileJSON(this.dataFile);
            }
            */
        })
        /*
        if (dataFileFound) {
            rawData._children = await this.getDataFileJSON(dataFileFound);
            console.log(rawData);
        }
        return rawData;
        */
    },

    buildScopeData(el, parentData) {
        let currentData = parentData;
        if (el.hasAttribute('p-data')) {
            const dataId = el.getAttribute('p-id') || 'unnamed_scope';
            if (!parentData._p_children) {
                parentData._p_children = {};
            }
            if (!parentData._p_children[dataId]) {
                parentData._p_children[dataId] = {};
            }
            currentData = parentData._p_children[dataId]; 
            currentData._p_data = el.getAttribute('p-data');
        }
        let child = el.firstElementChild;
        while (child) {
            this.buildScopeData(child, currentData); 
            child = child.nextElementSibling;
        }
    },

    registerListeners() {
        this.walkDom(this.root, el => {
            Array.from(el.attributes).forEach(attribute => {
                if (! attribute.name.startsWith('@')) return

                let event = attribute.name.replace('@', '')

                el.addEventListener(event, () => {
                    eval(`with (this.data) { (${attribute.value}) }`)
                })
            })
        })
    },

    /*
    observe(data) {
        var self = this
        return new Proxy(data, {
            set(target, key, value) {
                target[key] = value

                self.refreshDom()
            }
        })
    },
    */
    observe(data, parentScope) {
        const localTarget = data;
        let proxyTarget = localTarget;
        if (parentScope) {
            proxyTarget = Object.create(parentScope._p_target || parentScope);
            Object.assign(proxyTarget, localTarget);
        }
        const proxy = new Proxy(proxyTarget, {
            set: (target, key, value) => {
                target[key] = value;
                this.walkDomScoped(this.root, this.data, false);
                return true;
            }
        });
        proxy._p_target = proxyTarget;
        return proxy;
    },

    refreshDom() {
        this.walkDom(this.root, el => {
            Array.from(el.attributes).forEach(attribute => {
                if (! Object.keys(this.directives).includes(attribute.name)) return

                this.directives[attribute.name](el, eval(`with (this.data) { (${attribute.value}) }`))
            })
        })
    },

    walkDom(el, callback) {
        callback(el)

        el = el.firstElementChild

        while (el) {
            this.walkDom(el, callback)

            el = el.nextElementSibling
        }
    },

    walkDomScoped(el, parentScope, isHydrating = false) {
        let currentScope = parentScope;

        // --- SCOPE DETERMINATION & CREATION ---
        if (el.hasAttribute('p-data')) {
            // A. HYDRATION PHASE (One-Time Setup)
            if (isHydrating) {
                const dataId = el.getAttribute('p-id');
                const localRawData = parentScope._p_target._p_children[dataId]; 
                
                // 1. Create new inherited Proxy
                currentScope = this.observe(localRawData, parentScope); 
                
                // 2. Execute p-data assignments (e.g., count = count * 2)
                try {
                    //eval(`with (currentScope) { (${localRawData._p_data}) }`);
                    eval(`with (currentScope) { ${localRawData._p_data} }`);
                } catch (e) {
                    console.error(`Error executing p-data expression on ${dataId}:`, e);
                }
            } else {
                // B. REFRESH PHASE (Read Stored Scope)
                // If p-data is present, the scope MUST be stored from the hydration phase.
                currentScope = el._scope; 
            }
            
        } else {
            // C. NO p-data (Inherit Parent Scope)
            // currentScope remains parentScope for this element and its children
        }
        
        // CRITICAL: Store scope reference on ALL elements during Hydration,
        // and rely on it during Refresh.
        if (isHydrating) {
            el._scope = currentScope;
        }
        
        // --- DIRECTIVE EVALUATION ---
        if (currentScope) { // Safety check to prevent the 'undefined' error
            Array.from(el.attributes).forEach(attribute => {
                // 1. Event Listener Registration (Hydration Only)
                if (isHydrating && attribute.name.startsWith('@')) {
                    let event = attribute.name.replace('@', '');
                    el.addEventListener(event, () => {
                        eval(`with (el._scope) { (${attribute.value}) }`); 
                    });
                }
                
                // 2. Directive Evaluation (Both Hydration and Refresh)
                if (Object.keys(this.directives).includes(attribute.name)) {
                    const value = eval(`with (currentScope) { (${attribute.value}) }`);
                    this.directives[attribute.name](el, value);
                }
            });
        }

        // --- RECURSION ---
        let child = el.firstElementChild;
        while (child) {
            this.walkDomScoped(child, currentScope, isHydrating); 
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
            rawData = null; // Ensure rawData is null in case of error
        }
        return rawData;
    }
}

window.Pattr.start()

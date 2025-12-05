window.Pattr = {
    directives: {
        'p-text': (el, value, modifiers = {}) => {
            let text = String(value);
            
            // Apply trim modifier
            if (modifiers.trim && modifiers.trim.length > 0) {
                const maxLength = parseInt(modifiers.trim[0]) || 100;
                if (text.length > maxLength) {
                    text = text.substring(0, maxLength) + '...';
                }
            }
            
            el.innerText = text;
        },
        'p-html': (el, value, modifiers = {}) => {
            let html = value;
            
            // Apply allow filter first (if present)
            if (modifiers.allow && modifiers.allow.length > 0) {
                const allowedTags = modifiers.allow;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                // Recursively filter elements
                const filterNode = (node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName.toLowerCase();
                        if (!allowedTags.includes(tagName)) {
                            // Replace with text content
                            return document.createTextNode(node.textContent);
                        }
                        // Keep element but filter children
                        const filtered = node.cloneNode(false);
                        Array.from(node.childNodes).forEach(child => {
                            const filteredChild = filterNode(child);
                            if (filteredChild) filtered.appendChild(filteredChild);
                        });
                        return filtered;
                    }
                    return node.cloneNode();
                };
                
                const filtered = document.createElement('div');
                Array.from(tempDiv.childNodes).forEach(child => {
                    const filteredChild = filterNode(child);
                    if (filteredChild) filtered.appendChild(filteredChild);
                });
                html = filtered.innerHTML;
            }
            
            // Apply trim modifier (counts only text, preserves HTML tags)
            if (modifiers.trim && modifiers.trim.length > 0) {
                const maxLength = parseInt(modifiers.trim[0]) || 100;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                let charCount = 0;
                let truncated = false;
                
                // Recursively traverse and trim while preserving HTML structure
                const trimNode = (node) => {
                    if (truncated) return null;
                    
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent;
                        const remaining = maxLength - charCount;
                        
                        if (text.length <= remaining) {
                            charCount += text.length;
                            return node.cloneNode();
                        } else {
                            // This text node exceeds limit
                            truncated = true;
                            const trimmedText = text.substring(0, remaining) + '...';
                            return document.createTextNode(trimmedText);
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const cloned = node.cloneNode(false);
                        for (let child of node.childNodes) {
                            const trimmedChild = trimNode(child);
                            if (trimmedChild) {
                                cloned.appendChild(trimmedChild);
                            }
                            if (truncated) break;
                        }
                        return cloned;
                    }
                    return node.cloneNode();
                };
                
                const result = document.createElement('div');
                for (let child of tempDiv.childNodes) {
                    const trimmedChild = trimNode(child);
                    if (trimmedChild) {
                        result.appendChild(trimmedChild);
                    }
                    if (truncated) break;
                }
                
                html = result.innerHTML;
            }
            
            el.innerHTML = html;
        },
        'p-show': (el, value) => {
            el.style.display = value ? 'initial' : 'none'
        },
        'p-model': (el, value) => {
            el.value = value
        },
    },
    
    parseDirectiveModifiers(attrName) {
        // Parse: p-html:trim.300:allow.p.h1.h2
        // Returns: { directive: 'p-html', modifiers: { trim: ['300'], allow: ['p', 'h1', 'h2'] } }
        const parts = attrName.split(':');
        const directive = parts[0];
        const modifiers = {};
        
        // Parse each modifier group
        for (let i = 1; i < parts.length; i++) {
            const modParts = parts[i].split('.');
            const modName = modParts[0];
            const modValues = modParts.slice(1);
            modifiers[modName] = modValues;
        }
        
        return { directive, modifiers };
    },

    async start() {
        this.root = document.documentElement;

        // Load root data (props from CMS)
        const rootDataJsonString = document.getElementById("p-root-data")?.textContent;
        let rootData = {};
        try {
            rootData = JSON.parse(rootDataJsonString || '{}');
        } catch (e) {
            console.error("Error parsing root data JSON:", e);
        }

        // Load local data (UI state variables)
        const localDataJsonString = document.getElementById("p-local-data")?.textContent;
        let localData = {};
        try {
            localData = JSON.parse(localDataJsonString || '{}');
        } catch (e) {
            console.error("Error parsing local data JSON:", e);
        }

        // Merge root and local data
        this.rawData = { ...rootData, ...localData };
        
        // Store root data keys for future API saving (only save props, not local vars)
        this.rootDataKeys = Object.keys(rootData);

        this.buildScopeData(this.root, this.rawData);
        this.data = this.observe(this.rawData)
        this.walkDomScoped(this.root, this.data, true);
    },

    buildScopeData(el, parentData) {
        let currentData = parentData;
        if (el.hasAttribute('p-scope')) {
            const dataId = el.getAttribute('p-id') || 'missing_p-id';
            if (!parentData._p_children) {
                parentData._p_children = {};
            }
            if (!parentData._p_children[dataId]) {
                parentData._p_children[dataId] = {};
            }
            currentData = parentData._p_children[dataId]; 
            currentData._p_scope = el.getAttribute('p-scope');
        }
        let child = el.firstElementChild;
        while (child) {
            this.buildScopeData(child, currentData); 
            child = child.nextElementSibling;
        }
    },

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

    walkDomScoped(el, parentScope, isHydrating = false) {
        let currentScope = parentScope;

        // --- SCOPE DETERMINATION & CREATION ---
        if (el.hasAttribute('p-scope')) {
            // A. HYDRATION PHASE (One-Time Setup)
            if (isHydrating) {
                const dataId = el.getAttribute('p-id');
                const localRawData = parentScope._p_target._p_children[dataId]; 
                
                // 1. Create new inherited Proxy
                currentScope = this.observe(localRawData, parentScope); 
                
                // 2. Execute p-scope assignments (e.g., count = count * 2)
                try {
                    eval(`with (currentScope) { ${localRawData._p_scope} }`);
                } catch (e) {
                    console.error(`Error executing p-scope expression on ${dataId}:`, e);
                }
            } else {
                // B. REFRESH PHASE (Use stored scope)
                currentScope = el._scope;
                
                // If scope wasn't stored during hydration, use parent scope
                if (!currentScope) {
                    currentScope = parentScope;
                } else {
                    // Check if parent values changed - if so, selectively re-execute p-scope
                    const pScopeExpr = el.getAttribute('p-scope');
                    if (pScopeExpr && currentScope._p_target) {
                        // Get parent scope
                        const parentProto = Object.getPrototypeOf(currentScope._p_target);
                        
                        // Track which parent variables changed
                        const changedParentVars = new Set();
                        if (!el._parentSnapshot) {
                            el._parentSnapshot = {};
                        }
                        
                        // Check which specific parent values changed
                        for (let key in parentProto) {
                            if (!key.startsWith('_p_')) {
                                if (el._parentSnapshot[key] !== parentProto[key]) {
                                    changedParentVars.add(key);
                                }
                                el._parentSnapshot[key] = parentProto[key];
                            }
                        }
                        
                        // If any parent changed, selectively re-execute statements
                        if (changedParentVars.size > 0) {
                            try {
                                // Split p-scope into individual statements
                                const statements = pScopeExpr.split(';').map(s => s.trim()).filter(s => s);
                                
                                const tempScope = new Proxy(currentScope._p_target, {
                                    get: (target, key) => {
                                        if (key === '_p_target' || key === '_p_children' || key === '_p_scope') {
                                            return target[key];
                                        }
                                        return parentProto[key];
                                    },
                                    set: (target, key, value) => {
                                        target[key] = value;
                                        return true;
                                    }
                                });
                                void tempScope; // Explicit reference for linter
                                
                                // Only re-execute statements that depend on changed parent variables
                                statements.forEach(stmt => {
                                    // Check if statement uses any changed parent variable on RHS
                                    let shouldExecute = false;
                                    changedParentVars.forEach(varName => {
                                        // Simple heuristic: check if variable appears on right side of assignment
                                        const parts = stmt.split('=');
                                        if (parts.length > 1) {
                                            const rhs = parts.slice(1).join('=');
                                            if (rhs.includes(varName)) {
                                                shouldExecute = true;
                                            }
                                        }
                                    });
                                    
                                    if (shouldExecute) {
                                        eval(`with (tempScope) { ${stmt} }`);
                                    }
                                });
                            } catch (e) {
                                console.error(`Error re-executing p-scope expression:`, e);
                            }
                        }
                    }
                }
            }
            
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
                if (isHydrating && attribute.name.startsWith('p-on:')) {
                    let event = attribute.name.replace('p-on:', '');
                    el.addEventListener(event, () => {
                        eval(`with (el._scope) { (${attribute.value}) }`); 
                    });
                }
                
                // 2. p-model Two-Way Binding Setup (Hydration Only)
                if (isHydrating && attribute.name === 'p-model') {
                    el.addEventListener('input', (e) => {
                        eval(`with (el._scope) { ${attribute.value} = e.target.value }`);
                    });
                }
                
                // 3. Directive Evaluation (Both Hydration and Refresh)
                // Check if attribute is a directive (with or without modifiers)
                const parsed = this.parseDirectiveModifiers(attribute.name);
                if (Object.keys(this.directives).includes(parsed.directive)) {
                    const value = eval(`with (currentScope) { (${attribute.value}) }`);
                    this.directives[parsed.directive](el, value, parsed.modifiers);
                }
            });
        }

        // --- RECURSION ---
        let child = el.firstElementChild;
        while (child) {
            this.walkDomScoped(child, currentScope, isHydrating); 
            child = child.nextElementSibling;
        }
    }

}

window.Pattr.start()

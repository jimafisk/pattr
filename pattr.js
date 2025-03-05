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
        this.root = document.querySelector('[p-data-file-json]');
        this.rawData = await this.getInitialData()
        this.data = this.observe(this.rawData)
        this.registerListeners()
        this.refreshDom()
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

    observe(data) {
        var self = this
        return new Proxy(data, {
            set(target, key, value) {
                target[key] = value

                self.refreshDom()
            }
        })
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

    async getInitialData() {
        this.rawData;
        this.dataFile = this.root.getAttribute('p-data-file-json');
		await fetch(this.dataFile)
			.then(response => response.json())
			.then(data => this.rawData = data)
			.catch(error => console.error('Error:', error));
		return this.rawData;
    }
}

window.Pattr.start()

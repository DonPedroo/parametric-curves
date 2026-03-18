import Sketch from './index.js'
import './style.css'

const container = document.querySelector('#app')

if (container) {
    const sketch = new Sketch(container)
    sketch.init().catch(err => {
        console.error('Failed to initialize sketch:', err)
    })
} else {
    console.error('Container element #app not found')
}

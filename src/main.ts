import { createApp } from 'vue'
import PetApp from './PetApp.vue'
import HomeApp from './HomeApp.vue'
import './styles/main.css'

const windowType = window.electronAPI?.getWindowType() ?? 'pet'
const RootApp = windowType === 'home' ? HomeApp : PetApp

createApp(RootApp).mount('#app')

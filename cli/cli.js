import App from './app';


const runApp = async () => {
    const app = new App()
    await app.init()
}

runApp()

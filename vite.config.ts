import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	// base задаётся через VITE_BASE_PATH при сборке под подкаталог (например /crm/),
	// по умолчанию приложение обслуживается из корня домена
	base: process.env.VITE_BASE_PATH || "/",
	plugins: [react()],
	server: {
		host: "127.0.0.1",
		port: 9000,
	},
})

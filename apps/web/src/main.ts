import "./styles/index.css";
import { Workstation } from "./app/workstation";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root is missing.");

new Workstation().mount(root);


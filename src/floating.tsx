import { render } from "solid-js/web";
import FloatingApp from "./components/floating/App";
import "./styles/floating.css";
import { initTheme } from "./stores/themeStore";
import { openMenu } from "./stores/floatingStore";

// 初始化主题系统
initTheme();

// 文档级右键监听 —— 最高优先级，确保拦截到事件
document.addEventListener(
    "contextmenu",
    (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX, e.clientY);
    },
    true,
);

document.addEventListener(
    "mousedown",
    (e) => {
        if (e.button === 2) {
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
        }
    },
    true,
);

const root = document.getElementById("root");
if (root) {
    render(() => <FloatingApp />, root);
}

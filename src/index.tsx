import { staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { FaKey } from "react-icons/fa";
import { PasswordMangerContextProvider } from "./context";
import { PasswordManager } from "./components/password-manager";

function Content() {
  return (
    <PasswordMangerContextProvider>
      <PasswordManager></PasswordManager>
    </PasswordMangerContextProvider>
  );
}

export default definePlugin(() => {
  return {
    name: "DeckWarden",
    titleView: <div className={staticClasses.Title}>DeckWarden</div>,
    content: <Content />,
    icon: <FaKey />,
    onDismount() {},
  };
});

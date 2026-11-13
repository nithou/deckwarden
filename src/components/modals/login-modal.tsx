import { Button, findSP, ModalRoot, ModalRootProps } from "@decky/ui";
import { useState } from "react";
import { FaClipboard, FaSignInAlt } from "react-icons/fa";
import { toaster } from "@decky/api";
import { ModalContent } from "../shared";
import { PasswordInput } from "../password-input";

type ApiKeyField = "clientId" | "clientSecret";

const readClipboard = async (): Promise<string> => {
  // The modal lives in the Big Picture window, which holds focus; fall back
  // to the plugin's own context if that fails.
  try {
    return await findSP().navigator.clipboard.readText();
  } catch {
    return await navigator.clipboard.readText();
  }
};

// Accepts either a bare value, or the whole text from Vaultwarden's
// "View API Key" dialog ("client_id: user.… client_secret: … scope: api").
export const parseApiKeyText = (text: string) => {
  const clientId =
    text.match(/client_id\W*(user\.[0-9a-f-]+)/i)?.[1] ??
    text.match(
      /\buser\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
    )?.[0];
  const clientSecret = text.match(/client_secret\W*([A-Za-z0-9]+)/i)?.[1];
  return { clientId, clientSecret };
};

export interface LoginModalProps extends ModalRootProps {
  onLogin: (clientId: string, clientSecret: string) => Promise<void>;
}

export const LoginModal = (props: LoginModalProps) => {
  const [clientId, setClientId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");

  const pasteInto = async (field: ApiKeyField) => {
    let text: string;
    try {
      text = (await readClipboard()).trim();
    } catch (e) {
      console.error(e);
      toaster.toast({ title: "DeckWarden", body: "Could not read the clipboard" });
      return;
    }

    if (!text) {
      toaster.toast({ title: "DeckWarden", body: "The clipboard is empty" });
      return;
    }

    const parsed = parseApiKeyText(text);

    // Whole API key dialog pasted: fill both fields at once
    if (parsed.clientId && parsed.clientSecret) {
      setClientId(parsed.clientId);
      setClientSecret(parsed.clientSecret);
      return;
    }

    if (field === "clientId") {
      setClientId(parsed.clientId ?? text);
    } else {
      setClientSecret(parsed.clientSecret ?? text);
    }
  };

  const pasteButton = (field: ApiKeyField, disabled: boolean) => (
    <Button
      style={{ width: "auto", minWidth: "40px", marginLeft: "12px" }}
      className="DialogButton"
      disabled={disabled}
      onClick={() => pasteInto(field)}
    >
      <FaClipboard />
    </Button>
  );

  return (
    <ModalRoot onCancel={() => props.closeModal?.()}>
      <ModalContent
        icon={<FaSignInAlt />}
        title="Log in with API Key"
        onConfirm={() => props.onLogin(clientId, clientSecret)}
        canConfirm={clientId.trim() !== "" && clientSecret.trim() !== ""}
        closeModal={props.closeModal}
      >
        {(isLoading) => (
          <>
            <div style={{ marginBottom: "10px" }}>
              Find your personal API key in the Vaultwarden web vault under{" "}
              <strong>Account Settings → Security → Keys → View API Key</strong>. Use{" "}
              <FaClipboard /> to paste from the clipboard. Pasting the whole dialog text
              fills both fields.
            </div>
            <PasswordInput
              label="client_id"
              disabled={isLoading}
              value={clientId}
              bIsPassword={true}
              onChange={(e) => setClientId(e.target.value)}
              extraControls={pasteButton("clientId", isLoading)}
            />
            <div style={{ marginTop: "10px" }} />
            <PasswordInput
              label="client_secret"
              disabled={isLoading}
              value={clientSecret}
              bIsPassword={true}
              onChange={(e) => setClientSecret(e.target.value)}
              extraControls={pasteButton("clientSecret", isLoading)}
            />
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
};

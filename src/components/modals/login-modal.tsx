import {
  Button,
  DropdownItem,
  findSP,
  ModalRoot,
  ModalRootProps,
  TextField,
} from "@decky/ui";
import { useState } from "react";
import { FaClipboard, FaEnvelope, FaSignInAlt } from "react-icons/fa";
import { toaster } from "@decky/api";
import { ModalContent } from "../shared";
import { PasswordInput } from "../password-input";
import { PasswordLoginResult, TwoFactorMethod } from "../../interfaces";

type LoginMode = "password" | "apikey";
type ApiKeyField = "clientId" | "clientSecret";

const EMAIL_METHOD: TwoFactorMethod = 1;

const twoFactorOptions: { data: TwoFactorMethod | null; label: string }[] = [
  { data: null, label: "None" },
  { data: 0, label: "Authenticator app" },
  { data: 1, label: "Email" },
  { data: 3, label: "YubiKey OTP" },
];

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

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div style={{ marginTop: "10px", marginBottom: "10px", whiteSpace: "normal" }}>
    {children}
  </div>
);

export interface LoginModalProps extends ModalRootProps {
  onLoginApiKey: (clientId: string, clientSecret: string) => Promise<boolean>;
  onLoginPassword: (
    email: string,
    password: string,
    method: TwoFactorMethod | null,
    code: string | null
  ) => Promise<PasswordLoginResult>;
}

export const LoginModal = (props: LoginModalProps) => {
  const [mode, setMode] = useState<LoginMode>("password");

  // Email + password
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [method, setMethod] = useState<TwoFactorMethod | null>(null);
  const [code, setCode] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // API key
  const [clientId, setClientId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");

  const handlePasswordResult = (result: PasswordLoginResult, sentEmail: boolean) => {
    if (result === "code_required") {
      setMessage(
        sentEmail
          ? "A code was sent to your email address. Enter it below."
          : "Two-step login is enabled on this account. Select your method and enter the code."
      );
    } else if (result === "method_required") {
      setMessage("Your account has several two-step methods. Select the one to use.");
    } else {
      setMessage(null);
    }
    return result === "unlocked";
  };

  const sendEmailCode = async () => {
    setIsSendingCode(true);
    try {
      const result = await props.onLoginPassword(email, password, EMAIL_METHOD, null);
      if (handlePasswordResult(result, result === "code_required")) {
        props.closeModal?.();
      }
    } finally {
      setIsSendingCode(false);
    }
  };

  const onConfirm = async () => {
    if (mode === "apikey") {
      return await props.onLoginApiKey(clientId, clientSecret);
    }
    const result = await props.onLoginPassword(
      email,
      password,
      method,
      method !== null && code.trim() !== "" ? code : null
    );
    return handlePasswordResult(result, false);
  };

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

  const canConfirm =
    mode === "apikey"
      ? clientId.trim() !== "" && clientSecret.trim() !== ""
      : email.trim() !== "" && password !== "" && (method === null || code.trim() !== "");

  return (
    <ModalRoot onCancel={() => props.closeModal?.()}>
      <ModalContent
        icon={<FaSignInAlt />}
        title="Log in to Vaultwarden"
        onConfirm={onConfirm}
        canConfirm={canConfirm && !isSendingCode}
        closeModal={props.closeModal}
      >
        {(isLoading) => {
          const disabled = isLoading || isSendingCode;
          return (
            <>
              <DropdownItem
                label="Login method"
                disabled={disabled}
                rgOptions={[
                  { data: "password", label: "Email & master password" },
                  { data: "apikey", label: "Personal API key" },
                ]}
                selectedOption={mode}
                onChange={(option) => {
                  setMode(option.data);
                  setMessage(null);
                }}
              />

              {mode === "password" && (
                <>
                  <TextField
                    label="Email"
                    disabled={disabled}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div style={{ marginTop: "10px" }} />
                  <PasswordInput
                    label="Master password"
                    disabled={disabled}
                    value={password}
                    bIsPassword={true}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <DropdownItem
                    label="Two-step login"
                    disabled={disabled}
                    rgOptions={twoFactorOptions}
                    selectedOption={method}
                    onChange={(option) => setMethod(option.data)}
                  />
                  {method !== null && (
                    <TextField
                      label="Two-step code"
                      disabled={disabled}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  )}
                  {method === EMAIL_METHOD && (
                    <Button
                      style={{ marginTop: "10px" }}
                      className="DialogButton"
                      disabled={disabled || email.trim() === "" || password === ""}
                      onClick={sendEmailCode}
                    >
                      <FaEnvelope /> {isSendingCode ? "Sending..." : "Send code by email"}
                    </Button>
                  )}
                  {message && (
                    <Hint>
                      <strong>{message}</strong>
                    </Hint>
                  )}
                  <Hint>
                    Logging in also unlocks the vault. FIDO2/WebAuthn keys and Duo are not
                    supported here: use the <strong>personal API key</strong> instead.
                  </Hint>
                </>
              )}

              {mode === "apikey" && (
                <>
                  <Hint>
                    Find your personal API key in the Vaultwarden web vault under{" "}
                    <strong>Account Settings → Security → Keys → View API Key</strong>.
                    Use <FaClipboard /> to paste from the clipboard. Pasting the whole
                    dialog text fills both fields.
                  </Hint>
                  <PasswordInput
                    label="client_id"
                    disabled={disabled}
                    value={clientId}
                    bIsPassword={true}
                    onChange={(e) => setClientId(e.target.value)}
                    extraControls={pasteButton("clientId", disabled)}
                  />
                  <div style={{ marginTop: "10px" }} />
                  <PasswordInput
                    label="client_secret"
                    disabled={disabled}
                    value={clientSecret}
                    bIsPassword={true}
                    onChange={(e) => setClientSecret(e.target.value)}
                    extraControls={pasteButton("clientSecret", disabled)}
                  />
                </>
              )}
            </>
          );
        }}
      </ModalContent>
    </ModalRoot>
  );
};

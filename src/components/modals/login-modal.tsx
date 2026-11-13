import { ModalRoot, ModalRootProps } from "@decky/ui";
import { useState } from "react";
import { FaSignInAlt } from "react-icons/fa";
import { ModalContent } from "../shared";
import { PasswordInput } from "../password-input";

export interface LoginModalProps extends ModalRootProps {
  onLogin: (clientId: string, clientSecret: string) => Promise<void>;
}

export const LoginModal = (props: LoginModalProps) => {
  const [clientId, setClientId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");

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
              <strong>Account Settings → Security → Keys → View API Key</strong>.
            </div>
            <PasswordInput
              label="client_id"
              disabled={isLoading}
              value={clientId}
              bIsPassword={true}
              onChange={(e) => setClientId(e.target.value)}
            />
            <div style={{ marginTop: "10px" }} />
            <PasswordInput
              label="client_secret"
              disabled={isLoading}
              value={clientSecret}
              bIsPassword={true}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
};

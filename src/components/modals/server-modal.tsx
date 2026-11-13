import { ModalRoot, ModalRootProps, TextField } from "@decky/ui";
import { useState } from "react";
import { FaServer } from "react-icons/fa";
import { ModalContent } from "../shared";

export interface ServerModalProps extends ModalRootProps {
  initialUrl: string | null;
  onConfigure: (url: string) => Promise<void>;
}

export const ServerModal = (props: ServerModalProps) => {
  const [url, setUrl] = useState<string>(props.initialUrl ?? "https://");

  const isValid = /^https?:\/\/[^\s/]+/.test(url.trim());

  return (
    <ModalRoot onCancel={() => props.closeModal?.()}>
      <ModalContent
        icon={<FaServer />}
        title="Vaultwarden Server"
        onConfirm={() => props.onConfigure(url)}
        canConfirm={isValid}
        closeModal={props.closeModal}
      >
        {(isLoading) => (
          <>
            <div style={{ marginBottom: "10px" }}>
              Changing the server <strong>logs you out</strong>.
            </div>
            <TextField
              label="Server URL"
              disabled={isLoading}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
};

import { ButtonItem, findSP, Focusable, showModal } from "@decky/ui";
import { useState } from "react";
import {
  FaCaretDown,
  FaCaretRight,
  FaCheckCircle,
  FaDownload,
  FaExclamationTriangle,
  FaServer,
  FaSignInAlt,
  FaSpinner,
} from "react-icons/fa";
import { usePasswordManagerContext } from "../context";
import { ButtonItemIconContent } from "./shared";
import { BwInstallState, SetupState } from "../interfaces";
import { ServerModal } from "./modals/server-modal";
import { LoginModal } from "./modals/login-modal";

const projectGithubUrl = "https://github.com/nithou/deckwarden";

const isDoneIcon = (isDone: boolean) => (isDone ? "✅" : "❌");

const isDoneText = (isDone: boolean) =>
  isDone ? `${isDoneIcon(isDone)} Done` : `${isDoneIcon(isDone)} Not done`;

export const isLoggedIn = (setupState: SetupState | null) =>
  !!setupState?.bwInstalled && setupState.status !== "unauthenticated";

export const SetupGuide = (props: { initiallyOpen?: boolean }) => {
  const [showGuide, setShowGuide] = useState(!!props.initiallyOpen);

  return (
    <div>
      <ButtonItem
        layout="below"
        onClick={() => {
          setShowGuide(!showGuide);
        }}
      >
        <ButtonItemIconContent icon={showGuide ? <FaCaretDown /> : <FaCaretRight />}>
          Setup Guide
        </ButtonItemIconContent>
      </ButtonItem>

      {showGuide && (
        <div style={{ marginTop: "20px" }}>
          <BwInstallSteps />
          <div style={{ marginTop: "30px" }} />
          <ServerSteps />
          <div style={{ marginTop: "30px" }} />
          <LoginSteps />
          <Focusable
            onActivate={() => {}}
            style={{ overflowWrap: "break-word", marginTop: "30px" }}
          >
            Please visit <strong>{projectGithubUrl}</strong> if you encounter any issues.
          </Focusable>
        </div>
      )}
    </div>
  );
};

const getInstallState = (
  setupState: SetupState | null,
  bwInstallState: BwInstallState
): BwInstallState => {
  if (setupState?.bwInstalled) {
    return "done";
  }

  if (bwInstallState === "done" && !setupState?.bwInstalled) {
    return "initial";
  }

  return bwInstallState;
};

const BwInstallSteps = () => {
  const { setupState, installBw, bwInstallState } = usePasswordManagerContext();

  const installState = getInstallState(setupState, bwInstallState);

  const isInstallDisabled = ["done", "installing"].includes(installState);

  const buttonStates: Record<BwInstallState, [React.ReactNode, string]> = {
    done: [<FaCheckCircle />, "Installed"],
    installing: [<FaSpinner />, "Installing..."],
    initial: [<FaDownload />, "Install"],
    error: [<FaExclamationTriangle />, "Try again"],
  };

  const [buttonIcon, buttonText] = buttonStates[installState];

  return (
    <div>
      <h4>
        <strong>1. Install Bitwarden CLI: {isDoneText(!!setupState?.bwInstalled)}</strong>
      </h4>
      <strong>Click</strong> the button below to download the official{" "}
      <strong>Bitwarden CLI</strong> (about 45 MB download)
      <ButtonItem
        layout="below"
        disabled={isInstallDisabled}
        onClick={() => {
          installBw();
        }}
      >
        <ButtonItemIconContent icon={buttonIcon}>{buttonText}</ButtonItemIconContent>
      </ButtonItem>
      {installState === "error" && (
        <>
          <strong>Installation failed.</strong> Check your internet connection and try
          again.
        </>
      )}
    </div>
  );
};

const ServerSteps = () => {
  const { setupState, configureServer } = usePasswordManagerContext();

  const isDone =
    !!setupState?.serverUrl && setupState.serverUrl !== "https://vault.bitwarden.com";

  return (
    <div>
      <h4>
        <strong>2. Set Vaultwarden server: {isDoneText(isDone)}</strong>
      </h4>
      {setupState?.serverUrl && (
        <div style={{ wordBreak: "break-word" }}>
          Current: <strong>{setupState.serverUrl}</strong>
        </div>
      )}
      <ButtonItem
        layout="below"
        disabled={!setupState?.bwInstalled}
        onClick={() =>
          showModal(
            <ServerModal
              initialUrl={setupState?.serverUrl ?? null}
              onConfigure={configureServer}
            />,
            findSP()
          )
        }
      >
        <ButtonItemIconContent icon={<FaServer />}>Set Server URL</ButtonItemIconContent>
      </ButtonItem>
    </div>
  );
};

const LoginSteps = () => {
  const { setupState, login } = usePasswordManagerContext();

  const loggedIn = isLoggedIn(setupState);

  return (
    <div>
      <h4>
        <strong>3. Log in: {isDoneText(loggedIn)}</strong>
      </h4>
      Log in once with your <strong>personal API key</strong>. Afterwards you only need
      your <strong>master password</strong> to unlock.
      <ButtonItem
        layout="below"
        disabled={!setupState?.bwInstalled || loggedIn}
        onClick={() => showModal(<LoginModal onLogin={login} />, findSP())}
      >
        <ButtonItemIconContent icon={<FaSignInAlt />}>Log in</ButtonItemIconContent>
      </ButtonItem>
    </div>
  );
};

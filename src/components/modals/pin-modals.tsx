import { ModalRoot, ModalRootProps } from "@decky/ui";
import { useState } from "react";
import { FaKey, FaUnlockAlt } from "react-icons/fa";
import { ModalContent } from "../shared";
import { PasswordInput } from "../password-input";
import { PinUnlockResult } from "../../interfaces";

const isValidPin = (pin: string) => /^\d{4,8}$/.test(pin);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div style={{ marginTop: "10px", marginBottom: "10px", whiteSpace: "normal" }}>
    {children}
  </div>
);

export interface SetPinModalProps extends ModalRootProps {
  onSetPin: (pin: string) => Promise<boolean>;
}

export const SetPinModal = (props: SetPinModalProps) => {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const mismatch = confirmation !== "" && pin !== confirmation;

  return (
    <ModalRoot onCancel={() => props.closeModal?.()}>
      <ModalContent
        icon={<FaKey />}
        title="Set a PIN"
        onConfirm={() => props.onSetPin(pin)}
        canConfirm={isValidPin(pin) && pin === confirmation}
        closeModal={props.closeModal}
      >
        {(isLoading) => (
          <>
            <Hint>
              Use a <strong>4 to 8 digit PIN</strong> to unlock DeckWarden after it locks.
              Your master password is still needed after 5 wrong attempts, a restart or
              the time limit; the PIN then works again. Don't reuse your phone or bank
              PIN.
            </Hint>
            <PasswordInput
              label="PIN"
              mustBeNumeric={true}
              disabled={isLoading}
              value={pin}
              bIsPassword={true}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <div style={{ marginTop: "10px" }} />
            <PasswordInput
              label="Confirm PIN"
              mustBeNumeric={true}
              disabled={isLoading}
              value={confirmation}
              bIsPassword={true}
              onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ""))}
            />
            {mismatch && (
              <Hint>
                <strong>The PINs don't match.</strong>
              </Hint>
            )}
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
};

export interface PinUnlockModalProps extends ModalRootProps {
  attemptsLeft: number;
  onUnlock: (pin: string) => Promise<PinUnlockResult>;
}

export const PinUnlockModal = (props: PinUnlockModalProps) => {
  const [pin, setPin] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(props.attemptsLeft);

  const onConfirm = async () => {
    const result = await props.onUnlock(pin);
    if (result === "wrong") {
      setPin("");
      setAttemptsLeft((n) => n - 1);
      return false; // stay open for another try
    }
    return true; // unlocked, or PIN no longer usable (master password needed)
  };

  return (
    <ModalRoot onCancel={() => props.closeModal?.()}>
      <ModalContent
        icon={<FaUnlockAlt />}
        title="Unlock with PIN"
        onConfirm={onConfirm}
        canConfirm={isValidPin(pin)}
        closeModal={props.closeModal}
      >
        {(isLoading) => (
          <>
            {attemptsLeft < 5 && (
              <Hint>
                <strong>{attemptsLeft} attempts left</strong> before the master password
                is required.
              </Hint>
            )}
            <PasswordInput
              label="PIN"
              mustBeNumeric={true}
              disabled={isLoading}
              value={pin}
              bIsPassword={true}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
};

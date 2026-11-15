import { ButtonItem, DropdownItem, findSP, showModal, ToggleField } from "@decky/ui";
import { useState } from "react";
import { FaCaretDown, FaCaretRight, FaKey } from "react-icons/fa";
import { usePasswordManagerContext } from "../context";
import { ButtonItemIconContent } from "./shared";
import { SetPinModal } from "./modals/pin-modals";

const autoLockOptions = [
  { data: 0, label: "Never" },
  { data: 5, label: "5 minutes" },
  { data: 10, label: "10 minutes" },
  { data: 15, label: "15 minutes" },
  { data: 30, label: "30 minutes" },
  { data: 60, label: "1 hour" },
];

const pinMaxHoursOptions = [
  { data: 1, label: "1 hour" },
  { data: 4, label: "4 hours" },
  { data: 8, label: "8 hours" },
  { data: 24, label: "24 hours" },
  { data: 0, label: "Only on restart" },
];

export const SettingsSection = ({ vaultOpen }: { vaultOpen: boolean }) => {
  const { autoLockMinutes, setAutoLockMinutes, pinState, setPinSettings, setPin } =
    usePasswordManagerContext();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <ButtonItem layout="below" onClick={() => setExpanded(!expanded)}>
        <ButtonItemIconContent icon={expanded ? <FaCaretDown /> : <FaCaretRight />}>
          Settings
        </ButtonItemIconContent>
      </ButtonItem>

      {expanded && (
        <>
          {autoLockMinutes !== null && (
            <DropdownItem
              label="Auto-lock"
              description="Lock the vault after this long without using it"
              rgOptions={autoLockOptions}
              selectedOption={autoLockMinutes}
              onChange={(option) => setAutoLockMinutes(option.data)}
            />
          )}

          {pinState && (
            <>
              <ToggleField
                label="Unlock with PIN"
                description="After unlocking with your master password, use a PIN when the vault locks"
                checked={pinState.enabled}
                onChange={(checked) => setPinSettings(checked, pinState.maxHours)}
              />
              {pinState.enabled && (
                <DropdownItem
                  label="Require master password after"
                  description="Time since the last master password unlock. A restart always requires it."
                  rgOptions={pinMaxHoursOptions}
                  selectedOption={pinState.maxHours}
                  onChange={(option) => setPinSettings(true, option.data)}
                />
              )}
              {pinState.enabled && vaultOpen && (
                <ButtonItem
                  layout="below"
                  onClick={() => showModal(<SetPinModal onSetPin={setPin} />, findSP())}
                >
                  <ButtonItemIconContent icon={<FaKey />}>
                    {pinState.hasPin ? "Change PIN" : "Set PIN"}
                  </ButtonItemIconContent>
                </ButtonItem>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

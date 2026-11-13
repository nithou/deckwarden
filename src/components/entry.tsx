import { ButtonItem, DialogButton, Field, Focusable } from "@decky/ui";
import {
  FaCaretDown,
  FaCaretRight,
  FaUser,
  FaKey,
  FaEye,
  FaFolder,
  FaEyeSlash,
  FaInfoCircle,
  FaClock,
} from "react-icons/fa";
import { usePasswordManagerContext } from "../context";
import { Entry, TotpCode } from "../interfaces";
import { ButtonContentOverflow, ButtonItemIconContent } from "./shared";
import { useEffect, useRef, useState } from "react";

interface DetailDescriptionProps {
  children?: React.ReactNode;
}

const DetailDescription = ({ children }: DetailDescriptionProps) =>
  children ? (
    <div
      style={{
        fontSize: "15px",
        overflowWrap: "break-word",
        paddingTop: "10px",
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </div>
  ) : undefined;

export const PastingInstructions = () => {
  return (
    <DetailDescription>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          marginBottom: "5px",
          marginTop: "5px",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaInfoCircle size={18} />
        </div>
        <div style={{ flex: 4 }}>
          <strong>Select</strong> an input field <strong>before</strong> clicking on the
          paste button.
        </div>
      </div>
    </DetailDescription>
  );
};

const formatTotpCode = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

// Fetches the current code and refreshes it when the period rolls over.
// The secret never leaves the backend; only the short-lived code does.
const TotpDisplay = ({ entryId }: { entryId: string }) => {
  const { getEntryTotp } = usePasswordManagerContext();
  const [totp, setTotp] = useState<(TotpCode & { fetchedAt: number }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const result = await getEntryTotp(entryId);
        if (cancelled) return;
        setFailed(false);
        setTotp({ ...result, fetchedAt: Date.now() });
        timer = setTimeout(refresh, result.remainingSeconds * 1000 + 250);
      } catch (e) {
        console.error(e);
        if (!cancelled) setFailed(true);
      }
    };

    refresh();
    const ticker = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(ticker);
    };
  }, [entryId]);

  if (failed) {
    return <DetailDescription>Invalid TOTP secret</DetailDescription>;
  }

  if (!totp) {
    return <DetailDescription>…</DetailDescription>;
  }

  const remaining = Math.max(
    0,
    totp.remainingSeconds - Math.floor((now - totp.fetchedAt) / 1000)
  );

  return (
    <DetailDescription>
      <strong>{formatTotpCode(totp.code)}</strong> · {remaining}s
    </DetailDescription>
  );
};

export interface EntryComponentProps {
  entry: Entry;
}

export const EntryComponent = (props: EntryComponentProps) => {
  const { toggleCurrentEntry, currentEntry } = usePasswordManagerContext();

  const isCurrentEntry = currentEntry?.id === props.entry.id;

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    if (isCurrentEntry) {
      ref.current.scrollIntoView();
      const buttonItem = ref.current.querySelector("button");
      buttonItem?.focus();
    }
  }, [isCurrentEntry, ref, ref.current]);

  return (
    <div>
      <ButtonContentOverflow>
        <div ref={ref}>
          <ButtonItem
            layout="below"
            onClick={() => {
              if (isCurrentEntry) {
                toggleCurrentEntry(null, "copy");
                return;
              }

              toggleCurrentEntry(props.entry, "copy");
            }}
            label={props.entry.folderPath}
            icon={props.entry.folderPath ? <FaFolder /> : undefined}
            description={isCurrentEntry ? <PastingInstructions /> : undefined}
          >
            <ButtonItemIconContent
              icon={isCurrentEntry ? <FaCaretDown /> : <FaCaretRight />}
            >
              {props.entry.title}
            </ButtonItemIconContent>
          </ButtonItem>
        </div>
      </ButtonContentOverflow>
      {isCurrentEntry && <EntryContent />}
    </div>
  );
};

export const EntryContent = () => {
  const { pasteEntryDetail, currentEntryDetails, currentEntry, toggleCurrentEntry } =
    usePasswordManagerContext();

  if (!currentEntry) {
    return <div />;
  }

  const style: React.CSSProperties = {
    paddingLeft: "20px",
  };

  return (
    <div style={style}>
      {
        <>
          <ButtonItem
            layout="below"
            icon={<FaUser></FaUser>}
            label="Username"
            onClick={() => pasteEntryDetail("username")}
            description={
              <DetailDescription>{currentEntryDetails?.username}</DetailDescription>
            }
          >
            Paste
          </ButtonItem>

          <ButtonItem
            layout="below"
            label="Password"
            icon={<FaKey></FaKey>}
            onClick={() => pasteEntryDetail("password")}
            description={
              <DetailDescription>{currentEntryDetails?.password}</DetailDescription>
            }
          >
            Paste
          </ButtonItem>

          {currentEntry.hasTotp && (
            <ButtonItem
              layout="below"
              label="TOTP"
              icon={<FaClock></FaClock>}
              onClick={() => pasteEntryDetail("totp")}
              description={
                currentEntry.displayMode === "full" ? (
                  <TotpDisplay entryId={currentEntry.id} />
                ) : undefined
              }
            >
              Paste
            </ButtonItem>
          )}

          <Field childrenLayout="below" childrenContainerWidth="max">
            <Focusable style={{ display: "flex", gap: "10px" }}>
              {currentEntry.displayMode === "copy" && (
                <DialogButton
                  style={{ minWidth: "0", paddingLeft: "0", paddingRight: "0" }}
                  onClick={() => toggleCurrentEntry(currentEntry, "full")}
                >
                  <FaEye></FaEye>
                </DialogButton>
              )}
              {currentEntry.displayMode === "full" && (
                <DialogButton
                  style={{ minWidth: "0", paddingLeft: "0", paddingRight: "0" }}
                  onClick={() => toggleCurrentEntry(currentEntry, "copy")}
                >
                  <FaEyeSlash></FaEyeSlash>
                </DialogButton>
              )}
            </Focusable>
          </Field>
        </>
      }
    </div>
  );
};

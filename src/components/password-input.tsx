import { Button, TextField, TextFieldProps } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export interface PasswordInputProps extends TextFieldProps {
  extraControls?: React.ReactNode;
}

export const PasswordInput = ({ extraControls, ...props }: PasswordInputProps) => {
  const [showPassword, setShowPassword] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const setInputType = () => {
      if (!wrapperRef.current) {
        return;
      }

      const inputElement = wrapperRef.current.querySelector("input") as HTMLInputElement;

      if (!inputElement) {
        return;
      }

      const targetType = showPassword ? "text" : "password";
      if (inputElement.type !== targetType) {
        inputElement.type = targetType;
      }
    };

    setInputType();

    if (!wrapperRef.current) {
      return;
    }

    const observer = new MutationObserver(() => {
      setInputType();
    });

    observer.observe(wrapperRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["type"],
    });

    return () => observer.disconnect();
  }, [showPassword]);

  const icon = showPassword ? <FaEyeSlash /> : <FaEye />;

  const showButton = (
    <Button
      style={{ width: "auto", minWidth: "40px", marginLeft: "12px" }}
      className="DialogButton"
      onClick={() => setShowPassword(!showPassword)}
    >
      {icon}
    </Button>
  );

  return (
    <div ref={wrapperRef}>
      <TextField
        {...props}
        inlineControls={
          <>
            {showButton}
            {extraControls}
          </>
        }
      ></TextField>
    </div>
  );
};

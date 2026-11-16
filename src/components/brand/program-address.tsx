"use client";

import { useEffect, useRef, useState } from "react";

export function ProgramAddress({ address }: { address: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="hub-address">
      <span className="hub-resource-label">Program ID</span>
      <a className="hub-program" href={`https://explorer.solana.com/address/${address}?cluster=mainnet`} target="_blank" rel="noreferrer" title={`View ${address} on Solana Explorer`}>{address}</a>
      <div className="hub-address-actions"><button type="button" onClick={copyAddress}>Copy address</button><a href={`https://explorer.solana.com/address/${address}?cluster=mainnet`} target="_blank" rel="noreferrer">Explorer</a></div>
      <span className="hub-copy-status" role="status">{status === "copied" ? "Address copied" : status === "error" ? "Copy unavailable. Select the program ID to copy it." : ""}</span>
    </div>
  );
}

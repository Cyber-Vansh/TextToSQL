"use client";

import { useState } from "react";
import ServiceAwakener from "./ServiceAwakener";

export default function ClientGatekeeper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);

  return (
    <>
      {!isReady && (
        <ServiceAwakener onReady={() => setIsReady(true)} />
      )}
      {isReady && children}
    </>
  );
}

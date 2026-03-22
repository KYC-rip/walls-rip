/* eslint-disable @typescript-eslint/no-explicit-any */
import toast from "react-hot-toast";
import { PGP, type GhostHandshake } from "./pgp";

export const AddContact = async (rawText: string) => {
  try {
    const data: GhostHandshake = JSON.parse(rawText);
    if (PGP.isValidPublicKey(data.pubKey)) {
      toast.success('QR SCAN SUCCESS');
    }
  } catch (e: any) {
    if (PGP.isValidPublicKey(rawText)) {
      toast.success('LEGACY KEY IMPORTED');
    }
  }
}

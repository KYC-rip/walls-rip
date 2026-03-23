/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { GhostRelay } from '../utils/nostrService';
import { PGP, type GhostHandshake } from '../utils/pgp';
import type { KeyPair, Contact, Message } from '../components/ghostChat/types';

const INCOMING_SFX = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWoGAABzf4CAg4SFhoeIiYuMjY6PkJGSk5WWl5iZmpycnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzREWrwvRFi8W8hX/FQYW2BUOFm8V2RQkFFQT5hLBE5ISdRKZEc0QzBAGEDYP4w6zDfgMoAxWC+YK1QoJCgUJ9wjbCHgI/AcQB8AGmAZABhAG4gXNBZsFMgXkBOQEiQSUBEwE5APkA5cDbgNCA+cCzQK0AmoCQAIDAuQBtgGQAWMBOQHqAO4AlQCLAHEAQADq/9D/sf+c/3b/O//0/t3+uv6Q/mf+KP7v/c79qf2L/V/9G/36/M78qvyF/FH8Gfz5+/H7r/uH+1L7Gvv6+sz6pfp+2kLZQtZCy0LGQsBCukK0Qq9CqkKlQqFCnkKZQpRCjkKFQoBCfUJ3QnRCb0JpQmVCYEJcQlRCUEJKQkZCQUJAPz87Pzo/NT8wPyw/KD8kPyA/HD8YPxQ/ED8MPwg/BD8AP/4+/D74Pvg+9D7wPuw+6D7kPtQ+0D7MPsg+xD7APrw+tj6yPq4+qD6kPqA+nD6YPZQ9jj2GPX49ej10PXA9aj1kPWAvWi9UL04vRy9CLz0vOi80LywvJy8hLxsvFy8RLwwvBy8CL/wu+C7zLvAu7C7oLuQu4C7cLtau0i7MLsguwi68LrguNS4wLiwuKC4kLiAuHC4YLiAuKC40LkAuSi5WLmIucC58LokuXC9sL3wvii+WL6Avqi+2L8AvyjDWMOQw8TD+MQsxEzEXMRsxHzEkMSozLzQ3OUA9SkRTS1lTY11tYXVlen2Cg4aJi46PkZWWmZucnqGio6WnqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';

interface UseGhostWireProps {
  identity: KeyPair | null;
  partner: Contact | null;
  onNewContactRequest?: (contact: Contact) => void;
  onUpdatePartnerName?: (fp: string, newName: string) => void;
}

export const useGhostWire = ({
  identity,
  partner,
  onNewContactRequest,
  onUpdatePartnerName
}: UseGhostWireProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [relayStatus, setRelayStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  const relayRef = useRef<GhostRelay | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activePartnerRef = useRef<Contact | null>(null);
  const processedEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    activePartnerRef.current = partner;
  }, [partner]);

  useEffect(() => {
    audioRef.current = new Audio(INCOMING_SFX);
    audioRef.current.volume = 0.5;
  }, []);

  const playSound = () => audioRef.current?.play().catch(() => { });

  const saveMessageToStorage = useCallback((targetFingerprint: string, newMsg: Message) => {
    if (!identity) return [];
    const key = `ghost_msgs_${identity.fingerprint}_${targetFingerprint}`;
    
    const existingStr = sessionStorage.getItem(key);
    const existing: Message[] = existingStr ? JSON.parse(existingStr) : [];

    if (existing.some(m => m.id === newMsg.id)) return existing;

    const updated = [...existing, newMsg];
    sessionStorage.setItem(key, JSON.stringify(updated));

    if (activePartnerRef.current && activePartnerRef.current.fingerprint === targetFingerprint) {
      setMessages(updated);
    }
    
    return updated;
  }, [identity?.fingerprint]);

  useEffect(() => {
    if (partner && identity) {
      const key = `ghost_msgs_${identity.fingerprint}_${partner.fingerprint}`;
      const saved = sessionStorage.getItem(key);
      setMessages(saved ? JSON.parse(saved) : []);
    } else {
      setMessages([]);
    }
  }, [partner?.fingerprint, identity?.fingerprint]);

  useEffect(() => {
    if (!identity?.fingerprint || !identity?.privateKey) return;

    console.log("[COMMS] Initializing Global Uplink...");
    setIsConnecting(true);
    setRelayStatus('connecting');
    
    const relay = new GhostRelay();
    relayRef.current = relay;
    const myTopic = `ghost-${identity.fingerprint}`;

    relay.subscribe(myTopic, async (encryptedContent, _authorPubKey, timestamp) => {
      const eventId = `${timestamp}-${encryptedContent.substring(0, 10)}`;
      if (processedEvents.current.has(eventId)) return;
      processedEvents.current.add(eventId);

      try {
        console.log(`[COMMS] Packet Inbound...`);
        const rawDecrypted = await PGP.decrypt(encryptedContent, identity.privateKey);

        const headerMatch = rawDecrypted.match(/^\[FROM:([A-F0-9]{8})\]\s(.*)/s);
        let senderFingerprint = 'UNKNOWN';
        let payload = rawDecrypted;

        if (headerMatch) {
          senderFingerprint = headerMatch[1];
          payload = headerMatch[2];
        }

        if (payload.trim().startsWith('{') && payload.includes('pubKey')) {
          try {
            const handshake: GhostHandshake = JSON.parse(payload);
            const isSelf = handshake.fp === identity.fingerprint;
            
            if (isSelf) return;

            const contactsStr = localStorage.getItem('ghost_contacts');
            const contacts: Contact[] = contactsStr ? JSON.parse(contactsStr) : [];
            const knownContact = contacts.find(c => c.fingerprint === handshake.fp);

            if (!knownContact) {
              console.log("👻 New Contact Request:", handshake.name);
              if (onNewContactRequest) {
                onNewContactRequest({
                  name: handshake.name || 'Unknown',
                  publicKey: handshake.pubKey,
                  fingerprint: handshake.fp,
                  nostrTopic: handshake.topic,
                  addedAt: Date.now(),
                });
              }
              playSound();
              toast(`👋 New connection: ${handshake.name}`, { icon: '👻' });
            } else {
               if (handshake.name && handshake.name !== knownContact.name && onUpdatePartnerName) {
                 onUpdatePartnerName(handshake.fp, handshake.name);
               }
            }
            return;
          } catch (e) { }
        }

        if (senderFingerprint === 'UNKNOWN') {
           console.warn("⚠️ Unsigned message received");
           return; 
        }

        if (senderFingerprint === identity.fingerprint) {
           return;
        }

        const newMessage: Message = {
          id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          text: payload,
          sender: 'partner',
          timestamp: timestamp * 1000
        };

        saveMessageToStorage(senderFingerprint, newMessage);

        const isActiveChat = activePartnerRef.current && activePartnerRef.current.fingerprint === senderFingerprint;
        
        if (isActiveChat) {
        } else {
           playSound();
           toast(`📩 Message from ${senderFingerprint.slice(0, 4)}`, { icon: '💬', duration: 4000 });
        }

      } catch (e: any) {
        console.error("Decryption failed:", e);
      }
    });

    setIsConnecting(false);
    setRelayStatus('connected');

    const eoseTimeout = setTimeout(() => setRelayStatus('connected'), 3000);

    return () => {
      console.log("[COMMS] Severing Global Uplink.");
      clearTimeout(eoseTimeout);
      relay.cleanup();
      relayRef.current = null;
      setRelayStatus('disconnected');
    };
  }, [identity?.fingerprint, identity?.privateKey]);

  const sendMessage = async (text: string) => {
    const currentPartner = partner || activePartnerRef.current;
    
    if (!currentPartner || !identity) {
      toast('NO RECIPIENT', { icon: '🚫' });
      return;
    }

    let storedPayload: string | undefined;
    if (relayRef.current && currentPartner.nostrTopic) {
      try {
        if (messages.length === 0) {
           sendHandshake(true);
        }

        const signedContent = `[FROM:${identity.fingerprint}] ${text}`;
        storedPayload = await PGP.encrypt(signedContent, currentPartner.publicKey);
        await relayRef.current.publish(storedPayload, currentPartner.nostrTopic);
      } catch (e) {
        toast.error("SEND FAILED");
      }
    } else {
      const signedContent = `[FROM:${identity.fingerprint}] ${text}`;
      storedPayload = await PGP.encrypt(signedContent, currentPartner.publicKey);
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: text,
      sender: 'me',
      timestamp: Date.now(),
      payload: storedPayload
    };
    saveMessageToStorage(currentPartner.fingerprint, newMessage);
  };

  const sendHandshake = async (silent = false) => {
    const currentPartner = partner || activePartnerRef.current;
    if (!currentPartner || !relayRef.current || !identity) return;

    const handshake: GhostHandshake = {
      ver: 1,
      name: `USER-${identity.fingerprint.slice(0, 4)}`,
      pubKey: identity.publicKey,
      fp: identity.fingerprint,
      topic: `ghost-${identity.fingerprint}`
    };
    const json = JSON.stringify(handshake);

    try {
      const encrypted = await PGP.encrypt(json, currentPartner.publicKey);
      await relayRef.current.publish(encrypted, currentPartner.nostrTopic!);

      if (!silent) {
         toast.success("Handshake Sent");
      }
    } catch (e) {
      console.error("Handshake failed");
    }
  };

  const manualDecrypt = async (text: string) => {
    if (!partner || !identity) return;
    try {
      const decrypted = await PGP.decrypt(text, identity.privateKey);
      const newMessage: Message = {
        id: `manual-${Date.now()}`,
        text: decrypted,
        sender: 'partner',
        timestamp: Date.now()
      };
      saveMessageToStorage(partner.fingerprint, newMessage);
      toast.success('DECRYPTED');
    } catch (e: any) {
      toast.error("DECRYPTION FAILED");
    }
  };

  const clearMessages = () => setMessages([]);

  const getEncryptedPayload = async (text: string): Promise<string | null> => {
    const currentPartner = partner || activePartnerRef.current;
    if (!currentPartner || !identity) return null;
    const signedContent = `[FROM:${identity.fingerprint}] ${text}`;
    return await PGP.encrypt(signedContent, currentPartner.publicKey);
  };

  const addSystemMessage = useCallback((text: string) => {
    if (!partner) return;
    saveMessageToStorage(partner.fingerprint, {
      id: `sys-${Date.now()}-${Math.random()}`,
      text: text,
      sender: 'system',
      isSystem: true,
      timestamp: Date.now()
    });
  }, [partner, saveMessageToStorage]);

  return {
    messages,
    isConnecting,
    relayStatus,
    sendMessage,
    sendHandshake,
    manualDecrypt,
    clearMessages,
    addSystemMessage,
    getEncryptedPayload
  };
};

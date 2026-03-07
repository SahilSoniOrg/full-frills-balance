import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export const hasHardwareAsync = async () => {
    if (Platform.OS === 'web') {
        const available = typeof window !== 'undefined' &&
            window.PublicKeyCredential !== undefined;
        if (!available) return false;

        try {
            return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch {
            return false;
        }
    }
    return LocalAuthentication.hasHardwareAsync();
};

export const isEnrolledAsync = async () => {
    if (Platform.OS === 'web') {
        // We can't safely check if a passkey is enrolled without prompting on web.
        // Returning whether the hardware is available.
        return await hasHardwareAsync();
    }
    return LocalAuthentication.isEnrolledAsync();
};

export const enrollAsync = async (options: LocalAuthentication.LocalAuthenticationOptions) => {
    if (Platform.OS === 'web') {
        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const userId = new Uint8Array(16);
            crypto.getRandomValues(userId);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: {
                        name: "Full Frills Balance",
                        id: window.location.hostname
                    },
                    user: {
                        id: userId,
                        name: "user@fullfrills.local",
                        displayName: "App Lock User"
                    },
                    pubKeyCredParams: [
                        { alg: -7, type: "public-key" }, // ES256
                        { alg: -257, type: "public-key" } // RS256
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        residentKey: "required",
                        userVerification: "required"
                    },
                    timeout: 60000,
                    attestation: "none"
                }
            });

            if (credential) {
                return { success: true };
            }
            return { success: false, error: 'User cancelled or unsupported' };
        } catch (error) {
            console.error('WebAuthn enrollment error:', error);
            return { success: false, error: String(error) };
        }
    }

    // On Native, enrolling is just verifying identity the first time before enabling
    return LocalAuthentication.authenticateAsync(options);
};

export const authenticateAsync = async (options: LocalAuthentication.LocalAuthenticationOptions) => {
    if (Platform.OS === 'web') {
        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId: window.location.hostname,
                    userVerification: "required",
                }
            });

            if (assertion) {
                return { success: true };
            }
            return { success: false, error: 'User cancelled or failed' };
        } catch (error) {
            console.error('WebAuthn auth error:', error);
            return { success: false, error: String(error) };
        }
    }

    return LocalAuthentication.authenticateAsync(options);
};

use blake3::Hasher;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};

pub fn unsafe_deterministic_signature_keypair(bytes: &[u8]) -> (SigningKey, VerifyingKey) {
    let mut hasher = blake3::Hasher::new();
    hasher.update(bytes);
    let hash = hasher.finalize();

    let secret_key = SigningKey::from_bytes(hash.as_bytes());
    let public_key = VerifyingKey::from(&secret_key);
    (secret_key, public_key)
}

pub fn generate_proof(node_signature: String, payload: String) -> Result<(String, String), String> {
    let secret_desktop_key: &str =
        option_env!("SECRET_DESKTOP_INSTALLATION_PROOF_KEY").unwrap_or("Dc9{3R9JmXe7£w9Fs](7");
    let (secret_key, public_key) =
        unsafe_deterministic_signature_keypair(node_signature.as_bytes());
    // Convert the public key to hex
    let public_key_hex = hex::encode(public_key.to_bytes());

    // Combine the public key hex and the secret desktop key
    let combined = format!("{}{}", public_key_hex, secret_desktop_key);

    // Hash the combined value and take the last 4 characters
    let mut hasher = Hasher::new();
    hasher.update(combined.as_bytes());
    let hash_result = hasher.finalize();
    let hash_str = hex::encode(hash_result.as_bytes());
    let last_8_chars = &hash_str[hash_str.len() - 8..];

    // Concatenate the public key hex with the last 4 characters and JSON string using :::
    let concatenated = format!(
        "{}:::{}:::{}",
        public_key_hex,
        last_8_chars,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, payload.as_bytes())
    );

    // Hash the concatenated string
    let mut hasher = Hasher::new();
    hasher.update(concatenated.as_bytes());
    let final_hash_result = hasher.finalize();
    let final_hash_bytes = final_hash_result.as_bytes();

    // Sign the final hash
    let signature = secret_key.sign(final_hash_bytes);

    // Return the signature as a hexadecimal string and the concatenated string
    Ok((hex::encode(signature.to_bytes()), concatenated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier};

    const PAYLOAD: &str = r#"{"number_of_qa_subscriptions":3, "number_of_subscriptions":5}"#;

    /// The proof's three parts and its signature, each re-derived on its own from the node's signature
    /// and the payload, so the test holds whatever desktop key the build compiled in.
    #[test]
    fn the_proof_binds_the_payload_to_the_node_and_the_desktop_key() {
        let (signature, concatenated) = generate_proof("test_node_signature".to_string(), PAYLOAD.to_string()).unwrap();
        let (_, public) = unsafe_deterministic_signature_keypair(b"test_node_signature");
        let parts: Vec<&str> = concatenated.split(":::").collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], hex::encode(public.to_bytes()));
        let key = option_env!("SECRET_DESKTOP_INSTALLATION_PROOF_KEY").unwrap_or("Dc9{3R9JmXe7£w9Fs](7");
        let tag = hex::encode(blake3::hash(format!("{}{}", parts[0], key).as_bytes()).as_bytes());
        assert_eq!(parts[1], &tag[tag.len() - 8..]);
        assert_eq!(parts[2], base64::Engine::encode(&base64::engine::general_purpose::STANDARD, PAYLOAD));
        let signature = Signature::from_bytes(&hex::decode(signature).unwrap().try_into().unwrap());
        assert!(public.verify(blake3::hash(concatenated.as_bytes()).as_bytes(), &signature).is_ok());
    }

    #[test]
    fn another_node_or_payload_is_another_proof() {
        let base = generate_proof("test_node_signature".to_string(), PAYLOAD.to_string()).unwrap();
        assert_ne!(base, generate_proof("another_node".to_string(), PAYLOAD.to_string()).unwrap());
        assert_ne!(base, generate_proof("test_node_signature".to_string(), "{}".to_string()).unwrap());
    }
}

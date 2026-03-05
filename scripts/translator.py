# HAND-MADE LOGIC VALIDATOR
# This script calculates the "Life Force" (Chai) and converts words to Binary.

import sys

def run_logic():
    # 1. THE CHAI CALCULATION (Gematria)
    # Chet = 8, Yod = 10. Total = 18.
    chet = 8
    yod = 10
    life_force = chet + yod
    
    # Convert 18 to 6-bit binary for the ancient code
    binary_chai = bin(life_force)[2:].zfill(6)
    
    print("--- SACRED MATH CHECK ---")
    print(f"Hebrew 'Chai' Value: {life_force}")
    print(f"Ancient Binary Code: {binary_chai}")
    print("-------------------------\n")

    # 2. USER WORD TRANSLATION
    # If no word is provided, we use 'Chai'
    word = sys.argv[1] if len(sys.argv) > 1 else "Chai"
    
    print(f"Translating: {word}")
    for character in word:
        # Get ASCII number, then turn into 8-bit binary
        ascii_number = ord(character)
        binary_string = bin(ascii_number)[2:].zfill(8)
        
        print(f"{character} -> {ascii_number} -> {binary_string}")

if __name__ == "__main__":
    run_logic()
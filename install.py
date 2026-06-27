import os
import shutil
import sys

# Get the path of this custom node's directory
current_dir = os.path.dirname(os.path.abspath(__file__))

# Navigate up to the 'custom_nodes' directory
custom_nodes_dir = os.path.abspath(os.path.join(current_dir, ".."))

# Define the precise target folder inside rgthree-comfy
target_dir = os.path.join(custom_nodes_dir, "rgthree-comfy", "web", "comfyui")
source_file = os.path.join(current_dir, "web", "fast_groups_bypasser_linked.js")

def install_patch():
    print(f"[rgthree-linked] Checking for rgthree-comfy installation...")
    
    if not os.path.exists(target_dir):
        print(f"[rgthree-linked] ERROR: Could not find target path: {target_dir}")
        print("[rgthree-linked] Please ensure 'rgthree-comfy' is installed before this extension.")
        return False

    try:
        destination_file = os.path.join(target_dir, "fast_groups_bypasser_linked.js")
        shutil.copy(source_file, destination_file)
        print(f"[rgthree-linked] SUCCESS: Copied file to {destination_file}")
        return True
    except Exception as e:
        print(f"[rgthree-linked] ERROR: Failed to copy file: {e}")
        return False

if __name__ == "__main__":
    install_patch()

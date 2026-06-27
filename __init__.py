import os
import importlib

# Run the installation logic when ComfyUI initializes
current_dir = os.path.dirname(os.path.abspath(__file__))
install_script = os.path.join(current_dir, "install.py")

if os.path.exists(install_script):
    try:
        import shutil
        # Trigger the copy event on startup to ensure the file is there if updated
        custom_nodes_dir = os.path.abspath(os.path.join(current_dir, ".."))
        target_file = os.path.join(custom_nodes_dir, "rgthree-comfy", "web", "comfyui", "fast_groups_bypasser_linked.js")
        source_file = os.path.join(current_dir, "web", "fast_groups_bypasser_linked.js")
        
        if os.path.exists(os.path.dirname(target_file)):
            shutil.copy(source_file, target_file)
    except Exception:
        pass

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]



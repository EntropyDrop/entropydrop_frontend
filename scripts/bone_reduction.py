# /Applications/Blender.app/Contents/MacOS/Blender --background --python bone_reduction.py
import bpy
import os

def reduce_skeleton(filepath, output_path, bone_mapping, to_del=None, bone_lengths=None):
    """
    filepath: Input FBX path
    output_path: Output FBX path
    bone_mapping: Dictionary { 'retained_bone_name': ['sub_bone_to_merge_1', 'sub_bone_to_merge_2'] }
    to_del: List of bones that need to be directly deleted
    bone_lengths: Dictionary of bone lengths to set before exporting
    """
    # 1. Clean the scene and import
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=filepath)
    
    armature = None
    mesh_obj = None
    
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH':
            mesh_obj = obj

    if not armature:
        print("错误：未能在 FBX 中找到骨架")
        return

    # 2. Core: Weight transfer (Vertex Group Merging)
    if mesh_obj:
        bpy.context.view_layer.objects.active = mesh_obj
    
        for target_bone, sources in bone_mapping.items():
            if target_bone not in mesh_obj.vertex_groups:
                mesh_obj.vertex_groups.new(name=target_bone)
                
            target_grp = mesh_obj.vertex_groups[target_bone]
            
            for source_bone in sources:
                if source_bone in mesh_obj.vertex_groups:
                    if source_bone == target_bone:
                        continue
                        
                    source_grp = mesh_obj.vertex_groups[source_bone]
                    
                    # Traverse all vertices (suggest optimizing this loop for large models)
                    for v in mesh_obj.data.vertices:
                        try:
                            weight = source_grp.weight(v.index)
                            if weight > 0:
                                target_grp.add([v.index], weight, 'ADD')
                        except RuntimeError: # Vertex not in the group
                            pass
                    
                    # Remove the old weight group
                    mesh_obj.vertex_groups.remove(source_grp)

        # Delete vertex groups of bones in the to_del list
        if to_del:
            for del_bone in to_del:
                if del_bone in mesh_obj.vertex_groups:
                    mesh_obj.vertex_groups.remove(mesh_obj.vertex_groups[del_bone])

    # 3. Bone cleanup and adjustments (Edit Mode)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.data.edit_bones
    
    bones_to_remove = set()
    for target_bone, sources in bone_mapping.items():
        target_b = edit_bones.get(target_bone)
        
        # If the target bone does not exist, try renaming the first existing source bone to the target bone
        if not target_b:
            for s_name in sources:
                if s_name in edit_bones:
                    edit_bones[s_name].name = target_bone
                    target_b = edit_bones[target_bone]
                    print(f"重命名骨骼: {s_name} -> {target_bone}")
                    break
        
        if not target_b:
            print(f"警告: 找不到目标骨骼 {target_bone} 且无可用来源骨骼。")
            continue

        for source_name in sources:
            if source_name == target_bone: 
                continue
                
            if source_name in edit_bones:
                source_b = edit_bones[source_name]
                
                # Reconnect the children of the deleted bone to the target bone
                for child in source_b.children:
                    child.parent = target_b
                
                bones_to_remove.add(source_name)

    # Add bones in to_del to the deletion set
    if to_del:
        for del_name in to_del:
            bones_to_remove.add(del_name)

    # Delete bones in batch
    for b_name in bones_to_remove:
        if b_name in edit_bones:
            edit_bones.remove(edit_bones[b_name])

    # ===== Added: Set bone lengths here =====
    if bone_lengths:
        # Disconnect all bones first, otherwise changing length will cause child bones and meshes to squeeze and deform severely (e.g., "short leg" issue)
        for b in edit_bones:
            b.use_connect = False

        for b_name, length in bone_lengths.items():
            if b_name in edit_bones:
                edit_bones[b_name].length = length
                print(f"已设置骨骼 {b_name} 长度为: {length}")
            else:
                print(f"警告: 无法设置长度，未找到骨骼: {b_name}")

    bpy.ops.object.mode_set(mode='OBJECT')

    # 4. Export results
    bpy.ops.export_scene.fbx(
        filepath=output_path,
        use_selection=False,
        add_leaf_bones=False,
        bake_anim=True
    )
    print(f"处理完成！文件已保存至: {output_path}")

# Bone mapping: simplified to major joints
my_mapping = {
    'body': ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'],
    'neck': ['mixamorig:Neck'],
    'head': ['mixamorig:Head', 'mixamorig:HeadTop_End'],
    'left shoulder': ['mixamorig:LeftShoulder'],
    'left up arm': ['mixamorig:LeftArm'],
    'left low arm': [
        'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
        'mixamorig:LeftHandThumb1', 'mixamorig:LeftHandThumb2', 'mixamorig:LeftHandThumb3','mixamorig:LeftHandThumb4',
        'mixamorig:LeftHandIndex1', 'mixamorig:LeftHandIndex2', 'mixamorig:LeftHandIndex3','mixamorig:LeftHandIndex4',
        'mixamorig:LeftHandMiddle1', 'mixamorig:LeftHandMiddle2', 'mixamorig:LeftHandMiddle3','mixamorig:LeftHandMiddle4',
        'mixamorig:LeftHandRing1', 'mixamorig:LeftHandRing2', 'mixamorig:LeftHandRing3','mixamorig:LeftHandRing4',
        'mixamorig:LeftHandPinky1', 'mixamorig:LeftHandPinky2', 'mixamorig:LeftHandPinky3','mixamorig:LeftHandPinky4',
    ],
    'right shoulder': ['mixamorig:RightShoulder'],
    'right up arm': ['mixamorig:RightArm'],
    'right low arm': [
        'mixamorig:RightForeArm', 'mixamorig:RightHand',
        'mixamorig:RightHandThumb1', 'mixamorig:RightHandThumb2', 'mixamorig:RightHandThumb3','mixamorig:RightHandThumb4',
        'mixamorig:RightHandIndex1', 'mixamorig:RightHandIndex2', 'mixamorig:RightHandIndex3','mixamorig:RightHandIndex4',
        'mixamorig:RightHandMiddle1', 'mixamorig:RightHandMiddle2', 'mixamorig:RightHandMiddle3','mixamorig:RightHandMiddle4',
        'mixamorig:RightHandRing1', 'mixamorig:RightHandRing2', 'mixamorig:RightHandRing3','mixamorig:RightHandRing4',
        'mixamorig:RightHandPinky1', 'mixamorig:RightHandPinky2', 'mixamorig:RightHandPinky3','mixamorig:RightHandPinky4'
    ],
    'left up leg': ['mixamorig:LeftUpLeg'],
    'left low leg': ['mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftToeBase', 'mixamorig:LeftToe_End'],
    'right up leg': ['mixamorig:RightUpLeg'],
    'right low leg': ['mixamorig:RightLeg', 'mixamorig:RightFoot', 'mixamorig:RightToeBase', 'mixamorig:RightToe_End']
}

to_del = []

# Bone lengths to set (in MC scale)
my_lengths = {
    'head': 8.0,
    'neck': 1.0,
    'left up arm': 6.0,
    'left low arm': 6.0,
    'right up arm': 6.0,
    'right low arm': 6.0,
    'left up leg': 6.0,
    'left low leg': 6.0,
    'right up leg': 6.0,
    'right low leg': 6.0,
    'left shoulder': 3.0,
    'right shoulder': 3.0,
    'body': 12.0,
}

if __name__ == "__main__":
    # Read the fbx folder in the current directory
    fbx_dir = "./fbx"
    output_dir = "../public/fbx"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    for filename in os.listdir(fbx_dir):
        if filename.endswith(".fbx"):
            input_fbx = os.path.join(fbx_dir, filename)
            output_fbx = os.path.join(output_dir, filename)
            if os.path.exists(output_fbx):
                continue
            reduce_skeleton(input_fbx, output_fbx, my_mapping, to_del, bone_lengths=my_lengths)
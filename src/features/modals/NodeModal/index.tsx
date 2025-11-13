import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Group,
  TextInput,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { VscEdit } from "react-icons/vsc";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return {};
  if (nodeRows.length === 1 && !nodeRows[0].key) {
    return { value: nodeRows[0].value };
  }

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return obj;
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Utility function to update JSON at a specific path
const updateJsonAtPath = (
  json: any,
  path: NodeData["path"],
  newValues: Record<string, string>
): any => {
  if (!path || path.length === 0) {
    // Root level - replace entire object
    return newValues;
  }

  // Deep clone to avoid mutating original
  const cloned = JSON.parse(JSON.stringify(json));

  // Navigate to the parent of the target node
  let current = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }

  // Update the target node with new values
  const lastKey = path[path.length - 1];
  if (
    current[lastKey] &&
    typeof current[lastKey] === "object" &&
    !Array.isArray(current[lastKey])
  ) {
    // Update each property in the object
    Object.entries(newValues).forEach(([key, value]) => {
      // Try to preserve original type (number, boolean, null)
      const originalValue = current[lastKey][key];
      if (originalValue !== undefined) {
        // Try to parse as number or boolean, otherwise keep as string
        if (typeof originalValue === "number") {
          current[lastKey][key] = isNaN(Number(value)) ? value : Number(value);
        } else if (typeof originalValue === "boolean") {
          current[lastKey][key] = value === "true" || value === "false" ? value === "true" : value;
        } else if (originalValue === null) {
          current[lastKey][key] = value === "null" ? null : value;
        } else {
          current[lastKey][key] = value;
        }
      } else {
        current[lastKey][key] = value;
      }
    });
  }

  return cloned;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setContents = useFile(state => state.setContents);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedValues, setEditedValues] = React.useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = React.useState<Record<string, string>>({});

  // Initialize edited values when entering edit mode
  React.useEffect(() => {
    if (isEditing && nodeData) {
      const nodeObj = normalizeNodeData(nodeData.text ?? []);
      // Convert all values to strings for editing
      const stringValues: Record<string, string> = {};
      Object.entries(nodeObj).forEach(([key, value]) => {
        stringValues[key] = String(value ?? "");
      });
      setEditedValues(stringValues);
      setOriginalValues(stringValues); // Store original for cancel
    }
  }, [isEditing, nodeData]);

  // Reset edit mode when modal closes
  React.useEffect(() => {
    if (!opened) {
      setIsEditing(false);
      setEditedValues({});
      setOriginalValues({});
    }
  }, [opened]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleValueChange = (key: string, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    if (!nodeData) return;

    try {
      // Get current JSON
      const currentJson = getJson();
      const jsonObj = JSON.parse(currentJson);

      // Update JSON at the node's path with edited values
      const updatedJson = updateJsonAtPath(jsonObj, nodeData.path, editedValues);
      const updatedJsonString = JSON.stringify(updatedJson, null, 2);

      // Update the file contents, which will trigger graph update
      setContents({ contents: updatedJsonString, hasChanges: true });

      // Exit edit mode
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving node:", error);
    }
  };

  const handleCancel = () => {
    // Discard changes and restore original values
    setEditedValues(originalValues);
    setIsEditing(false);
  };

  const nodeObj = nodeData ? normalizeNodeData(nodeData.text ?? []) : {};
  const entries = Object.entries(nodeObj);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group gap="xs">
              {!isEditing && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<VscEdit size={14} />}
                  onClick={handleEditClick}
                >
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button size="xs" variant="subtle" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditing ? (
              <Stack gap="xs" p="xs">
                {entries.map(([key, value]) => (
                  <TextInput
                    key={key}
                    label={key}
                    value={editedValues[key] ?? String(value ?? "")}
                    onChange={e => handleValueChange(key, e.currentTarget.value)}
                    styles={{
                      label: { fontSize: "12px", fontWeight: 500 },
                      input: { fontFamily: "monospace", fontSize: "12px" },
                    }}
                  />
                ))}
              </Stack>
            ) : (
              <CodeHighlight
                code={JSON.stringify(nodeObj, null, 2)}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};

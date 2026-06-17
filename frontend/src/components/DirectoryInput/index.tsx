import {Button, Input, Space} from "antd";
import {FolderOpenOutlined} from "@ant-design/icons";
import {isDesktop, selectDirectory} from "../../utils/desktop.ts";

interface DirectoryInputProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
}

export default function DirectoryInput({value, onChange, placeholder}: DirectoryInputProps) {
    async function handleSelect() {
        const dir = await selectDirectory();
        if (dir !== undefined) {
            onChange?.(dir);
        }
    }

    if (!isDesktop()) {
        return <Input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}/>;
    }

    return (
        <Space.Compact style={{width: '100%'}}>
            <Input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}/>
            <Button icon={<FolderOpenOutlined/>} onClick={handleSelect} title="选择目录">浏览</Button>
        </Space.Compact>
    );
}

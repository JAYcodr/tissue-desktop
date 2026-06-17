import {Space} from "antd";
// DESKTOP-MODIFIED: 原上游目录名 "-components " 含尾部空格，Windows 无法 checkout，已重命名为 "-components"
import UserInfo from "./-components/info.tsx";
import UserList from "./-components/user.tsx";
import ApiKeyPanel from "./-components/apiKey.tsx";
import {useSelector} from "react-redux";
import {RootState} from "../../../models";
import {createFileRoute} from "@tanstack/react-router";

export const Route = createFileRoute('/_index/user/')({
    component: User
})

function User() {

    const {userInfo} = useSelector((state: RootState) => state.auth)

    return (
        <Space direction={'vertical'} style={{width: '100%'}}>
            <UserInfo/>
            {userInfo?.is_admin && (
                <UserList/>
            )}
            <ApiKeyPanel/>
        </Space>
    )
}

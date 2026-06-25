import {Form, Input} from "antd";

function Webhook() {
    return (
        <>
            <Form.Item name={'url'} label={'URL'}>
                <Input/>
            </Form.Item>
        </>
    )
}

export default Webhook
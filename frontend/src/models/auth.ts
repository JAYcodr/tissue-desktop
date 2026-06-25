import {createModel} from "@rematch/core";
import {RootModel} from "./index";
import Cookies from 'js-cookie';
import * as api from "../apis/auth";
import * as videoApi from "../apis/video.ts";
import {compare} from "compare-versions";
import {router} from "../routes.tsx";


interface State {
    userToken: string | undefined
    userInfo: any | undefined
    logging: boolean
    versions?: { current: string, latest: string, hasNew: boolean },
    videos: any[]
}

export const auth = createModel<RootModel>()({
    state: {
        userToken: Cookies.get("userToken"),
        userInfo: undefined,
        logging: false,
        version: undefined,
        videos: [],
    } as State,
    reducers: {
        setLogging(state, payload: boolean) {
            return {...state, logging: payload}
        },
        setToken(state, payload: string | undefined) {
            return {...state, userToken: payload}
        },
        setInfo(state, payload: any | undefined) {
            return {...state, userInfo: payload}
        },
        setVersions(state, payload: any | undefined) {
            return {...state, versions: payload}
        },
        setVideos(state, payload: any | undefined) {
            return {...state, videos: payload}
        },
    },
    effects: (dispatch) => ({
        async login(params: { username: string, password: string, remember: boolean }) {
            try {
                dispatch.auth.setLogging(true)
                const response = await api.login(params)
                const token = response.data.data
                Cookies.set('userToken', token, params.remember ? {expires: 365} : {})
                dispatch.auth.setToken(token)
                await router.invalidate()
            } catch (e) {
                const { message: antMsg } = await import('antd');
                const msg = (e as any)?.response?.data || (e as Error)?.message || '登录失败';
                antMsg.error(msg);
            } finally {
                dispatch.auth.setLogging(false)
            }
        },
        async logout() {
            Cookies.remove("userToken")
            dispatch.app.setPin('')
            dispatch.auth.setToken(undefined)
            await router.invalidate()
        },
        async getInfo() {
            try {
                const response = await api.getInfo()
                dispatch.auth.setInfo(response.data.data)
                const videos = await videoApi.getVideos()
                dispatch.auth.setVideos(videos)
            } catch (e) {
                console.error('[renderer] Failed to load user info:', e);
            }
        },
        async getVersions() {
            const response = await api.getVersions()
            const versions = response.data.data
            versions.hasNew = compare(versions.latest, versions.current, '>')
            dispatch.auth.setVersions(versions)
        }
    })
});

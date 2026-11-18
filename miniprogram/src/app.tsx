import { PropsWithChildren, useEffect } from 'react'
import {applyLocale} from './i18n'
import './app.scss'
export default function App({children}: PropsWithChildren){useEffect(()=>{applyLocale()},[]);return children}

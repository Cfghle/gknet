import styles from './Monitor.module.css';

export default function Monitor({ src, style }: { src: string; style?: React.CSSProperties }){
  return (
  <div className = {styles['monitor']} style = {style}>
    <img src = {src} alt = ""></img>
  </div>
  )
}

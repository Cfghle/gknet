import styles from './Monitor.module.css';

// children을 주면 이미지 대신 그걸 화면 안에 넣는다 (캔버스 게임 등)
export default function Monitor({ src, style, children }: { src?: string; style?: React.CSSProperties; children?: React.ReactNode }){
  return (
  <div className = {styles['monitor']} style = {style}>
    {children ?? <img src = {src} alt = ""></img>}
  </div>
  )
}

import { Image } from 'expo-image'
import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'

const BALL_SOURCE = require('../assets/balon.png')

const SIZE_CONFIG = {
  sm: { ball: 48, stageH: 72, bounce: -36, shadowW: 40 },
  md: { ball: 80, stageH: 120, bounce: -60, shadowW: 56 },
  lg: { ball: 120, stageH: 180, bounce: -88, shadowW: 72 },
} as const

type Size = keyof typeof SIZE_CONFIG

type Props = {
  size?: Size
  message?: string
  /** Ocupa toda la pantalla centrado. */
  fullScreen?: boolean
  style?: ViewStyle
  textColor?: string
  backgroundColor?: string
}

export function BallLoadingIndicator({
  size = 'lg',
  message,
  fullScreen = false,
  style,
  textColor,
  backgroundColor,
}: Props) {
  const theme = useScreenTheme()
  const cfg = SIZE_CONFIG[size]
  const bounceY = useRef(new Animated.Value(0)).current
  const rotate = useRef(new Animated.Value(0)).current
  const shadowScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bounceY, {
            toValue: cfg.bounce,
            duration: 780,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 1,
            duration: 780,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 0.55,
            duration: 780,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bounceY, {
            toValue: 0,
            duration: 760,
            easing: Easing.bounce,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 2,
            duration: 760,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 1,
            duration: 760,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(320),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [bounceY, rotate, shadowScale, cfg.bounce])

  const spin = rotate.interpolate({
    inputRange: [0, 2],
    outputRange: ['0deg', '720deg'],
  })

  const styles = useMemo(
    () =>
      StyleSheet.create({
        full: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
          backgroundColor: backgroundColor ?? theme.bg,
        },
        wrap: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        stage: {
          width: cfg.ball + 40,
          height: cfg.stageH,
          alignItems: 'center',
          justifyContent: 'flex-end',
        },
        ball: {
          width: cfg.ball,
          height: cfg.ball,
        },
        shadow: {
          position: 'absolute',
          bottom: 6,
          width: cfg.shadowW,
          height: size === 'sm' ? 8 : 14,
          borderRadius: 999,
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(15,69,57,0.18)',
        },
        message: {
          marginTop: size === 'sm' ? 6 : 12,
          fontSize: size === 'sm' ? 13 : 15,
          fontWeight: '500',
          textAlign: 'center',
          color: textColor ?? theme.textMuted,
        },
      }),
    [theme, cfg, size, backgroundColor, textColor]
  )

  const content = (
    <View style={[styles.wrap, style]}>
      <View style={styles.stage}>
        <Animated.View
          style={[styles.shadow, { transform: [{ scaleX: shadowScale }] }]}
        />
        <Animated.View
          style={{
            transform: [{ translateY: bounceY }, { rotate: spin }],
          }}
        >
          <Image source={BALL_SOURCE} style={styles.ball} contentFit="contain" />
        </Animated.View>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  )

  if (fullScreen) {
    return <View style={styles.full}>{content}</View>
  }

  return content
}

import { Image } from 'expo-image'
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'

const BOUNCE_UP_MS = 780
const BOUNCE_DOWN_MS = 760
const BOUNCE_PAUSE_MS = 320

type AuthProfileLoadingScreenProps = {
  message?: string
}

export function AuthProfileLoadingScreen({
  message = 'Cargando tu perfil…',
}: AuthProfileLoadingScreenProps) {
  const theme = useScreenTheme()
  const bounceY = useRef(new Animated.Value(0)).current
  const rotate = useRef(new Animated.Value(0)).current
  const shadowScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bounceY, {
            toValue: -88,
            duration: BOUNCE_UP_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 1,
            duration: BOUNCE_UP_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 0.55,
            duration: BOUNCE_UP_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bounceY, {
            toValue: 0,
            duration: BOUNCE_DOWN_MS,
            easing: Easing.bounce,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 2,
            duration: BOUNCE_DOWN_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 1,
            duration: BOUNCE_DOWN_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(BOUNCE_PAUSE_MS),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [bounceY, rotate, shadowScale])

  const spin = rotate.interpolate({
    inputRange: [0, 2],
    outputRange: ['0deg', '720deg'],
  })

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.shadow,
            {
              backgroundColor: theme.isDark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(15,69,57,0.18)',
              transform: [{ scaleX: shadowScale }],
            },
          ]}
        />
        <Animated.View
          style={{
            transform: [{ translateY: bounceY }, { rotate: spin }],
          }}
        >
          <Image
            source={require('../assets/balon.png')}
            style={styles.ball}
            contentFit="contain"
          />
        </Animated.View>
      </View>
      <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  stage: {
    width: 160,
    height: 180,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  ball: {
    width: 120,
    height: 120,
  },
  shadow: {
    position: 'absolute',
    bottom: 8,
    width: 72,
    height: 14,
    borderRadius: 999,
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
})

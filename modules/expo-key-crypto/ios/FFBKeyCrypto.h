#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface FFBKeyCrypto : NSObject
+ (void)setAllowed:(BOOL)allowed;
+ (nullable NSString *)executeOperation:(NSString *)operation
                                request:(NSString *)request
                                  error:(NSError **)error;
+ (nullable NSString *)importCredential:(NSString *)uri error:(NSError **)error;
+ (BOOL)writeCredential:(NSString *)handle
                    uri:(NSString *)uri
                  error:(NSError **)error;
+ (BOOL)retainCredential:(NSString *)handle error:(NSError **)error;
+ (BOOL)releaseCredential:(NSString *)handle error:(NSError **)error;
+ (void)clearCredentials;
@end
NS_ASSUME_NONNULL_END

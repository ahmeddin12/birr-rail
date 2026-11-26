import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'birrrail:isPublic';

/** Opts a controller or route out of API key authentication. Everything else requires a key. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
